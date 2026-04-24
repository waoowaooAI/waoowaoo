import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  userPreference: { findUnique: vi.fn() },
  projectEpisode: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  projectClip: { update: vi.fn(async () => ({})) },
  locationImage: { createMany: vi.fn(async () => ({ count: 0 })) },
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

const configMock = vi.hoisted(() => ({
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({ reasoningEffort: 'high' })),
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 2,
    image: 5,
    video: 5,
  })),
}))

const workflowMock = vi.hoisted(() => ({
  runStoryToScriptSkillWorkflow: vi.fn(),
}))
const domainMock = vi.hoisted(() => ({
  persistStoryToScriptWorkflowResults: vi.fn(async () => ({
    createdCharacters: [{ id: 'character-new-1' }],
    createdLocations: [{ id: 'location-new-1' }],
    createdProps: [{ id: 'prop-new-1' }],
    createdClipRows: [{ clipKey: 'clip-1', id: 'clip-row-1', version: '2026-04-14T00:00:00.000Z' }],
  })),
  persistRetryScreenplayResult: vi.fn(async () => ({ clipId: 'clip-row-1' })),
}))
const workflowLeaseMock = vi.hoisted(() => ({
  assertWorkflowRunActive: vi.fn(async () => undefined),
  withWorkflowRunLease: vi.fn(async (params: { run: () => Promise<unknown> }) => ({
    claimed: true,
    result: await params.run(),
  })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => ({
  chatCompletion: vi.fn(),
  getCompletionParts: vi.fn(() => ({ text: '', reasoning: '' })),
  getCompletionContent: vi.fn(() => ''),
}))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/logging/semantic', () => ({ logAIAnalysis: vi.fn() }))
vi.mock('@/lib/logging/file-writer', () => ({ onProjectNameAvailable: vi.fn() }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/skill-system/executors/story-to-script/preset', () => workflowMock)
vi.mock('@/lib/run-runtime/service', () => ({
  createArtifact: vi.fn(async () => undefined),
  listArtifacts: vi.fn(async () => []),
}))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    flush: vi.fn(async () => undefined),
  })),
}))
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: {
    CHARACTER_ANALYZE: 'character-analyze',
    LOCATION_ANALYZE: 'location-analyze',
    PROP_ANALYZE: 'prop-analyze',
    SCRIPT_CLIP_SEGMENTS: 'script-clip-segments',
    SCRIPT_GENERATE_SCREENPLAY: 'script-generate-screenplay',
  },
  getAiPromptTemplate: vi.fn(() => 'prompt-template'),
}))
vi.mock('@/lib/workers/handlers/story-to-script-helpers', () => ({
  asString: (value: unknown) => (typeof value === 'string' ? value : ''),
  parseEffort: vi.fn(() => null),
  parseTemperature: vi.fn(() => 0.7),
}))
vi.mock('@/lib/run-runtime/workflow-lease', () => workflowLeaseMock)
vi.mock('@/lib/domain/screenplay/service', () => domainMock)

import { handleStoryToScriptTask } from '@/lib/workers/handlers/story-to-script'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  const runId = typeof payload.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-test-story'
  const payloadMeta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? (payload.meta as Record<string, unknown>)
    : {}
  const normalizedPayload: Record<string, unknown> = {
    ...payload,
    runId,
    meta: {
      ...payloadMeta,
      runId,
    },
  }
  return {
    data: {
      taskId: 'task-story-to-script-1',
      type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: normalizedPayload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker story-to-script behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => await fn(prismaMock))

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      name: 'Project One',
      analysisModel: 'llm::analysis-1',
      directorStyleDoc: JSON.stringify({
        character: { intent: '角色风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        location: { intent: '场景风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        prop: { intent: '道具风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        storyboardPlan: { intent: '分镜风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        cinematography: { intent: '摄影风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        acting: { intent: '表演风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        storyboardDetail: { intent: '细化风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        image: { intent: '图片风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        video: { intent: '视频风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      }),
      characters: [{ id: 'char-1', name: 'Hero', introduction: 'hero intro' }],
      locations: [{ id: 'loc-1', name: 'Old Town', summary: 'town', assetKind: 'location' }],
    })

    prismaMock.projectEpisode.findUnique.mockResolvedValue({
      id: 'episode-1',
      projectId: 'project-1',
      novelText: 'episode text',
    })

    workflowMock.runStoryToScriptSkillWorkflow.mockResolvedValue({
      characterStep: { text: '{}', reasoning: '' },
      locationStep: { text: '{}', reasoning: '' },
      propStep: { text: '{}', reasoning: '' },
      splitStep: { text: '[]', reasoning: '' },
      charactersObject: { characters: [{ name: 'New Hero' }] },
      locationsObject: { locations: [{ name: 'Market' }] },
      analyzedCharacters: [{ name: 'New Hero' }],
      analyzedLocations: [{ name: 'Market' }],
      analyzedProps: [{ name: 'Knife', summary: 'bronze dagger' }],
      propsObject: { props: [{ name: 'Knife', summary: 'bronze dagger' }] },
      charactersLibName: 'New Hero、Hero',
      locationsLibName: 'Market',
      propsLibName: 'Knife',
      charactersIntroduction: 'intro',
      clipList: [{ id: 'clip-1', startText: 'a', endText: 'b', summary: 'clip summary', location: null, content: 'clip content', props: ['Knife'], characters: [], matchLevel: 'exact', matchConfidence: 1 }],
      screenplayResults: [
        {
          clipId: 'clip-1',
          success: true,
          screenplay: { scenes: [{ shot: 'close-up' }] },
        },
      ],
      summary: {
        clipCount: 1,
        screenplaySuccessCount: 1,
        screenplayFailedCount: 0,
        propCount: 1,
      },
    })
  })

  it('missing episodeId -> explicit error', async () => {
    const job = buildJob({}, null)
    await expect(handleStoryToScriptTask(job)).rejects.toThrow('episodeId is required')
  })

  it('success path -> persists clips and screenplay with concrete fields', async () => {
    const job = buildJob({ episodeId: 'episode-1', content: 'input content' })
    const result = await handleStoryToScriptTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      clipCount: 1,
      screenplaySuccessCount: 1,
      screenplayFailedCount: 0,
      persistedCharacters: 1,
      persistedLocations: 1,
      persistedProps: 1,
      persistedClips: 1,
    })

    expect(domainMock.persistStoryToScriptWorkflowResults).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      episodeId: 'episode-1',
      clipList: [{ id: 'clip-1', startText: 'a', endText: 'b', summary: 'clip summary', location: null, content: 'clip content', props: ['Knife'], characters: [], matchLevel: 'exact', matchConfidence: 1 }],
      mutation: expect.objectContaining({
        workflowId: 'story-to-script',
        runId: 'run-test-story',
        taskId: 'task-story-to-script-1',
      }),
    }))
    expect(workflowMock.runStoryToScriptSkillWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      directorStyleDoc: expect.objectContaining({
        character: expect.objectContaining({
          intent: '角色风格',
        }),
      }),
    }))
  })

  it('orchestrator partial failure summary -> throws explicit error', async () => {
    workflowMock.runStoryToScriptSkillWorkflow.mockResolvedValueOnce({
      characterStep: { text: '{}', reasoning: '' },
      locationStep: { text: '{}', reasoning: '' },
      propStep: { text: '{}', reasoning: '' },
      splitStep: { text: '[]', reasoning: '' },
      charactersObject: { characters: [] },
      locationsObject: { locations: [] },
      analyzedCharacters: [],
      analyzedLocations: [],
      analyzedProps: [],
      propsObject: { props: [] },
      charactersLibName: '无',
      locationsLibName: '无',
      propsLibName: '无',
      charactersIntroduction: '无',
      clipList: [],
      screenplayResults: [
        {
          clipId: 'clip-3',
          success: false,
          error: 'bad screenplay json',
        },
      ],
      summary: {
        clipCount: 1,
        screenplaySuccessCount: 0,
        screenplayFailedCount: 1,
      },
    })

    const job = buildJob({ episodeId: 'episode-1', content: 'input content' })
    await expect(handleStoryToScriptTask(job)).rejects.toThrow('STORY_TO_SCRIPT_PARTIAL_FAILED')
  })
})
