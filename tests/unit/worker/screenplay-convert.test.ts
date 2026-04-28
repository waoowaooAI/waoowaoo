import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  userPreference: { findUnique: vi.fn() },
  projectEpisode: { findUnique: vi.fn() },
  projectClip: { update: vi.fn(async () => ({})) },
}))

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({ id: 'completion-1' })),
  getCompletionContent: vi.fn(() => '{"scenes":[{"index":1}]}'),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

const helpersMock = vi.hoisted(() => ({
  parseScreenplayPayload: vi.fn(() => ({ scenes: [{ index: 1 }] })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-exec/llm-helpers', () => llmMock)
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(async () => ({
    text: llmMock.getCompletionContent(),
    reasoning: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    completion: { id: 'completion-1' },
  })),
}))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/constants', () => ({
  buildCharactersIntroduction: vi.fn(() => 'characters introduction'),
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/logging/semantic', () => ({ logAIAnalysis: vi.fn() }))
vi.mock('@/lib/logging/file-writer', () => ({ onProjectNameAvailable: vi.fn() }))
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
vi.mock('@/lib/workers/handlers/screenplay-convert-helpers', () => ({
  readText: (value: unknown) => (typeof value === 'string' ? value : ''),
  parseScreenplayPayload: helpersMock.parseScreenplayPayload,
}))
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { SCRIPT_GENERATE_SCREENPLAY: 'script-generate-screenplay' },
  getAiPromptTemplate: vi.fn(() => 'screenplay-template-{clip_content}-{clip_id}'),
}))

import { handleScreenplayConvertTask } from '@/lib/workers/handlers/screenplay-convert'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-screenplay-1',
      type: TASK_TYPE.SCREENPLAY_CONVERT,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker screenplay-convert behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      name: 'Project One',
      analysisModel: 'llm::analysis-1',
      characters: [{ name: 'Hero' }],
      locations: [{ name: 'Old Town' }],
    })

    prismaMock.projectEpisode.findUnique.mockResolvedValue({
      id: 'episode-1',
      projectId: 'project-1',
      clips: [
        {
          id: 'clip-1',
          content: 'clip 1 content',
        },
      ],
    })
  })

  it('missing episodeId -> explicit error', async () => {
    const job = buildJob({}, null)
    await expect(handleScreenplayConvertTask(job)).rejects.toThrow('episodeId is required')
  })

  it('success path -> writes screenplay json to clip row', async () => {
    const job = buildJob({ episodeId: 'episode-1' })
    const result = await handleScreenplayConvertTask(job)

    expect(result).toEqual(expect.objectContaining({
      episodeId: 'episode-1',
      total: 1,
      successCount: 1,
      failCount: 0,
      totalScenes: 1,
    }))

    expect(prismaMock.projectClip.update).toHaveBeenCalledWith({
      where: { id: 'clip-1' },
      data: {
        screenplay: JSON.stringify({
          scenes: [{ index: 1 }],
          clip_id: 'clip-1',
          original_text: 'clip 1 content',
        }),
      },
    })
  })

  it('clip parse failed -> throws partial failure error with code prefix', async () => {
    helpersMock.parseScreenplayPayload.mockImplementation(() => {
      throw new Error('invalid screenplay payload')
    })

    const job = buildJob({ episodeId: 'episode-1' })
    await expect(handleScreenplayConvertTask(job)).rejects.toThrow('SCREENPLAY_CONVERT_PARTIAL_FAILED')
  })
})
