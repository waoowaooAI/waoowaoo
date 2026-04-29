import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDirectorStyleDoc } from '@/lib/director-style'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type VoiceLineInput = {
  lineIndex: number
  speaker: string
  content: string
  emotionStrength: number
  matchedPanel: {
    storyboardId: string
    panelIndex: number
  }
}

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const assertTaskActiveMock = vi.hoisted(() => vi.fn(async () => undefined))
const withInternalLLMStreamCallbacksMock = vi.hoisted(() =>
  vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
)
const resolveProjectModelCapabilityGenerationOptionsMock = vi.hoisted(() =>
  vi.fn(async () => ({ reasoningEffort: 'high' })),
)
const runScriptToStoryboardSkillWorkflowMock = vi.hoisted(() =>
  vi.fn(async () => ({
    clipPanels: [
      {
        clipId: 'clip-1',
        clipIndex: 0,
        finalPanels: [
          {
            panel_number: 1,
            shot_type: 'close-up',
            camera_move: 'static',
            description: 'panel desc',
            video_prompt: 'panel prompt',
            location: 'room',
            characters: [{
              characterId: 'char-1',
              name: 'Narrator',
              appearanceId: 'app-1',
              appearance: '初始形象',
            }],
          },
        ],
      },
    ],
    phase1PanelsByClipId: {
      'clip-1': [
        {
          panel_number: 1,
          description: 'phase1',
          location: 'room',
        },
      ],
    },
    phase2CinematographyByClipId: {
      'clip-1': [
        {
          panel_number: 1,
          composition: 'close-up',
          lighting: 'soft',
          color_palette: 'warm',
          atmosphere: 'calm',
          technical_notes: 'steady',
        },
      ],
    },
    phase2ActingByClipId: {
      'clip-1': [
        {
          panel_number: 1,
          characters: ['Narrator calm'],
        },
      ],
    },
    phase3PanelsByClipId: {
      'clip-1': [
        {
          panel_number: 1,
          description: 'panel desc',
          location: 'room',
          characters: [{
            characterId: 'char-1',
            name: 'Narrator',
            appearanceId: 'app-1',
            appearance: '初始形象',
          }],
        },
      ],
    },
    summary: {
      totalPanelCount: 1,
      totalStepCount: 4,
    },
    voiceLineRows: [
      {
        lineIndex: 1,
        speaker: 'Narrator',
        content: 'Hello world',
        emotionStrength: 0.8,
        matchedPanel: {
          storyboardId: 'storyboard-1',
          panelIndex: 1,
        },
      },
    ],
  })),
)
const persistStoryboardWorkflowOutputsMock = vi.hoisted(() => vi.fn())
const parseStoryboardRetryTargetMock = vi.hoisted(() => vi.fn())
const runScriptToStoryboardAtomicRetryMock = vi.hoisted(() => vi.fn())
const workflowLeaseMock = vi.hoisted(() => ({
  assertWorkflowRunActive: vi.fn(async () => undefined),
  withWorkflowRunLease: vi.fn(async (params: { run: () => Promise<unknown> }) => ({
    claimed: true,
    result: await params.run(),
  })),
}))

const txState = vi.hoisted(() => ({
  createdRows: [] as Array<Record<string, unknown>>,
  deletedWhereClauses: [] as Array<Record<string, unknown>>,
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  userPreference: { findUnique: vi.fn() },
  projectEpisode: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/ai-exec/llm-helpers', () => ({
  chatCompletion: vi.fn(),
  getCompletionParts: vi.fn(() => ({ text: 'voice lines json', reasoning: '' })),
  getCompletionContent: vi.fn(() => 'voice lines json'),
}))

vi.mock('@/lib/config-service', () => ({
  resolveProjectModelCapabilityGenerationOptions: resolveProjectModelCapabilityGenerationOptionsMock,
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 2,
    image: 5,
    video: 5,
  })),
}))

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: withInternalLLMStreamCallbacksMock,
}))

vi.mock('@/lib/logging/semantic', () => ({
  logAIAnalysis: vi.fn(),
}))

vi.mock('@/lib/logging/file-writer', () => ({
  onProjectNameAvailable: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  buildCharactersIntroduction: vi.fn(() => 'characters-introduction'),
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: assertTaskActiveMock,
}))

vi.mock('@/lib/skill-system/executors/script-to-storyboard/preset', () => ({
  runScriptToStoryboardSkillWorkflow: runScriptToStoryboardSkillWorkflowMock,
}))
vi.mock('@/lib/skill-system/executors/script-to-storyboard/shared', () => ({
  SkillJsonParseError: class SkillJsonParseError extends Error {
    rawText: string

    constructor(message: string, rawText: string) {
      super(message)
      this.name = 'SkillJsonParseError'
      this.rawText = rawText
    }
  },
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
vi.mock('@/lib/run-runtime/service', () => ({
  createArtifact: vi.fn(async () => undefined),
}))

vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: {
    STORYBOARD_PLAN: 'storyboard-plan',
    STORYBOARD_REFINE_CINEMATOGRAPHY: 'storyboard-refine-cinematography',
    STORYBOARD_REFINE_ACTING: 'storyboard-refine-acting',
    STORYBOARD_REFINE_DETAIL: 'storyboard-refine-detail',
    VOICE_GENERATE_LINES: 'voice-generate-lines',
  },
  getAiPromptTemplate: vi.fn(() => 'prompt-template'),
  buildAiPrompt: vi.fn(() => 'voice-analysis-prompt'),
}))

vi.mock('@/lib/workers/handlers/script-to-storyboard-helpers', () => ({
  asJsonRecord: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  },
  parseEffort: vi.fn(() => null),
  parseTemperature: vi.fn(() => 0.7),
  toPositiveInt: (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    const n = Math.floor(value)
    return n > 0 ? n : null
  },
}))
vi.mock('@/lib/workers/handlers/script-to-storyboard-atomic-retry', () => ({
  parseStoryboardRetryTarget: parseStoryboardRetryTargetMock,
  runScriptToStoryboardAtomicRetry: runScriptToStoryboardAtomicRetryMock,
}))
vi.mock('@/lib/run-runtime/workflow-lease', () => workflowLeaseMock)
vi.mock('@/lib/domain/storyboard/service', () => ({
  persistStoryboardWorkflowOutputs: persistStoryboardWorkflowOutputsMock,
}))

import { handleScriptToStoryboardTask } from '@/lib/workers/handlers/script-to-storyboard'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  const runId = typeof payload.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-test-storyboard'
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
      taskId: 'task-1',
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
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

describe('worker script-to-storyboard behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txState.createdRows = []
    txState.deletedWhereClauses = []
    parseStoryboardRetryTargetMock.mockReturnValue(null)
    runScriptToStoryboardAtomicRetryMock.mockReset()

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      name: 'Project One',
      analysisModel: 'llm::analysis-model',
      directorStyleDoc: JSON.stringify(buildDirectorStyleDoc('horror-suspense')),
      characters: [{
        id: 'char-1',
        name: 'Narrator',
        appearances: [{ id: 'app-1', appearanceIndex: 0, changeReason: '初始形象' }],
      }],
      locations: [{ id: 'loc-1', name: 'Office' }],
    })

    prismaMock.projectEpisode.findUnique.mockResolvedValue({
      id: 'episode-1',
      projectId: 'project-1',
      novelText: 'A complete chapter text for voice analyze.',
      clips: [
        {
          id: 'clip-1',
          content: 'clip content',
          characters: JSON.stringify(['Narrator']),
          location: 'Office',
          screenplay: 'Screenplay text',
        },
      ],
    })

    prismaMock.$transaction.mockReset()

    persistStoryboardWorkflowOutputsMock.mockImplementation(async ({ voiceLineRows }: { voiceLineRows: VoiceLineInput[] | null }) => {
      const rows = voiceLineRows || []
      txState.createdRows = rows.map((row) => ({
        episodeId: 'episode-1',
        lineIndex: row.lineIndex,
        speaker: row.speaker,
        content: row.content,
        emotionStrength: row.emotionStrength,
        matchedPanelId: 'panel-1',
        matchedStoryboardId: 'storyboard-1',
        matchedPanelIndex: row.matchedPanel.panelIndex,
      }))
      txState.deletedWhereClauses = [
        rows.length === 0
          ? { episodeId: 'episode-1' }
          : {
            episodeId: 'episode-1',
            lineIndex: {
              notIn: rows.map((row) => row.lineIndex),
            },
          },
      ]
      return {
        persistedStoryboards: [
          {
            storyboardId: 'storyboard-1',
            clipId: 'clip-1',
            panels: [{ id: 'panel-1', panelIndex: 1 }],
          },
        ],
        voiceLineCount: rows.length,
      }
    })

  })

  it('缺少 episodeId -> 显式失败', async () => {
    const job = buildJob({}, null)
    await expect(handleScriptToStoryboardTask(job)).rejects.toThrow('episodeId is required')
  })

  it('成功路径: 写入 voice line 时包含 matchedPanel 映射后的 panelId', async () => {
    const job = buildJob({ episodeId: 'episode-1' })

    const result = await handleScriptToStoryboardTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      storyboardCount: 1,
      panelCount: 1,
      voiceLineCount: 1,
    })

    expect(txState.createdRows).toHaveLength(1)
    expect(txState.createdRows[0]).toEqual(expect.objectContaining({
      episodeId: 'episode-1',
      lineIndex: 1,
      speaker: 'Narrator',
      content: 'Hello world',
      emotionStrength: 0.8,
      matchedPanelId: 'panel-1',
      matchedStoryboardId: 'storyboard-1',
      matchedPanelIndex: 1,
    }))
    expect(txState.deletedWhereClauses[0]).toEqual({
      episodeId: 'episode-1',
      lineIndex: {
        notIn: [1],
      },
    })
    expect(runScriptToStoryboardSkillWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({
      projectData: expect.objectContaining({
        directorStyleDoc: expect.objectContaining({
          storyboardPlan: expect.objectContaining({
            shotSelection: expect.stringContaining('反应镜头'),
          }),
        }),
      }),
    }))
  })

  it('空台词数组 -> 成功完成并清空旧台词', async () => {
    runScriptToStoryboardSkillWorkflowMock.mockResolvedValueOnce({
      clipPanels: [
        {
          clipId: 'clip-1',
          clipIndex: 0,
          finalPanels: [
            {
              panel_number: 1,
              shot_type: 'close-up',
              camera_move: 'static',
              description: 'panel desc',
              video_prompt: 'panel prompt',
              location: 'room',
              characters: [{
                characterId: 'char-1',
                name: 'Narrator',
                appearanceId: 'app-1',
                appearance: '初始形象',
              }],
            },
          ],
        },
      ],
      phase1PanelsByClipId: {
        'clip-1': [],
      },
      phase2CinematographyByClipId: {
        'clip-1': [],
      },
      phase2ActingByClipId: {
        'clip-1': [],
      },
      phase3PanelsByClipId: {
        'clip-1': [],
      },
      summary: {
        totalPanelCount: 1,
        totalStepCount: 4,
      },
      voiceLineRows: [],
    })

    const job = buildJob({ episodeId: 'episode-1' })
    const result = await handleScriptToStoryboardTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      storyboardCount: 1,
      panelCount: 1,
      voiceLineCount: 0,
    })
    expect(txState.createdRows).toEqual([])
    expect(txState.deletedWhereClauses[0]).toEqual({
      episodeId: 'episode-1',
    })
  })

  it('phase 级重试: 仅执行原子 phase，不走整图重跑', async () => {
    parseStoryboardRetryTargetMock.mockReturnValue({
      stepKey: 'clip_clip-1_phase3_detail',
      clipId: 'clip-1',
      phase: 'phase3_detail',
    })
    runScriptToStoryboardAtomicRetryMock.mockResolvedValue({
      clipPanels: [
        {
          clipId: 'clip-1',
          clipIndex: 1,
          finalPanels: [
            {
              panel_number: 1,
              description: 'phase3 retry panel',
              location: 'Office',
            },
          ],
        },
      ],
      phase1PanelsByClipId: {},
      phase2CinematographyByClipId: {},
      phase2ActingByClipId: {},
      phase3PanelsByClipId: {
        'clip-1': [
          {
            panel_number: 1,
            description: 'phase3 retry panel',
            location: 'Office',
          },
        ],
      },
      totalPanelCount: 1,
      totalStepCount: 6,
    })

    const job = buildJob({
      episodeId: 'episode-1',
      retryStepKey: 'clip_clip-1_phase3_detail',
      retryStepAttempt: 2,
    })
    const result = await handleScriptToStoryboardTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      storyboardCount: 1,
      panelCount: 1,
      voiceLineCount: 0,
      retryStepKey: 'clip_clip-1_phase3_detail',
    })
    expect(runScriptToStoryboardAtomicRetryMock).toHaveBeenCalledTimes(1)
    expect(runScriptToStoryboardSkillWorkflowMock).not.toHaveBeenCalled()
    expect(persistStoryboardWorkflowOutputsMock).toHaveBeenCalledWith({
      episodeId: 'episode-1',
      clipPanels: [
        {
          clipId: 'clip-1',
          clipIndex: 1,
          finalPanels: [
            {
              panel_number: 1,
              description: 'phase3 retry panel',
              location: 'Office',
            },
          ],
        },
      ],
      voiceLineRows: null,
      mutation: expect.objectContaining({
        workflowId: 'script-to-storyboard',
        runId: 'run-test-storyboard',
        taskId: 'task-1',
      }),
    })
  })
})
