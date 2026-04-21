import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  projectPanel: {
    findUnique: vi.fn(),
  },
}))

const llmMock = vi.hoisted(() => ({
  chatCompletionWithVision: vi.fn(),
  getCompletionContent: vi.fn(),
}))

const cosMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
}))

const streamCtxMock = vi.hoisted(() => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

const llmStreamMock = vi.hoisted(() => {
  const flush = vi.fn(async () => undefined)
  return {
    flush,
    createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
    createWorkerLLMStreamCallbacks: vi.fn(() => ({
      onStage: vi.fn(),
      onChunk: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      flush,
    })),
  }
})

const persistMock = vi.hoisted(() => ({
  resolveAnalysisModel: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => llmMock)
vi.mock('@/lib/storage', () => cosMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => streamCtxMock)
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: workerMock.assertTaskActive,
}))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: llmStreamMock.createWorkerLLMStreamContext,
  createWorkerLLMStreamCallbacks: llmStreamMock.createWorkerLLMStreamCallbacks,
}))
vi.mock('@/lib/workers/handlers/shot-ai-persist', () => persistMock)
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { SHOT_VARIANT_ANALYZE: 'shot-variant-analyze' },
  buildAiPrompt: vi.fn(() => 'shot-variants-prompt'),
}))

import { handleAnalyzeShotVariantsTask } from '@/lib/workers/handlers/shot-ai-variants'
import { buildAiPrompt } from '@/lib/ai-prompts'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-shot-variants-1',
      type: TASK_TYPE.ANALYZE_SHOT_VARIANTS,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker shot-ai-variants behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistMock.resolveAnalysisModel.mockResolvedValue({
      id: 'np-1',
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
    })
    prismaMock.projectPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      panelNumber: 3,
      imageUrl: 'images/panel-1.png',
      description: 'panel desc',
      shotType: 'medium',
      cameraMove: 'static',
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'black coat' }]),
    })
    cosMock.getSignedUrl.mockReturnValue('https://signed.example/panel-1.png')
    llmMock.chatCompletionWithVision.mockResolvedValue({ id: 'vision-1' })
    llmMock.getCompletionContent.mockReturnValue('[{"name":"v1"},{"name":"v2"},{"name":"v3"}]')
  })

  it('panel not found -> explicit error', async () => {
    prismaMock.projectPanel.findUnique.mockResolvedValueOnce(null)
    const job = buildJob({ panelId: 'panel-404' })

    await expect(handleAnalyzeShotVariantsTask(job, job.data.payload as Record<string, unknown>)).rejects.toThrow('Panel not found')
  })

  it('success -> returns suggestions and signed panel image', async () => {
    const payload = { panelId: 'panel-1' }
    const job = buildJob(payload)

    const result = await handleAnalyzeShotVariantsTask(job, payload)

    expect(llmMock.chatCompletionWithVision).toHaveBeenCalledWith(
      'user-1',
      'llm::analysis-1',
      'shot-variants-prompt',
      ['https://signed.example/panel-1.png'],
      expect.objectContaining({
        projectId: 'project-1',
        action: 'analyze_shot_variants',
      }),
    )

    expect(result).toEqual(expect.objectContaining({
      success: true,
      suggestions: [{ name: 'v1' }, { name: 'v2' }, { name: 'v3' }],
      panelInfo: expect.objectContaining({
        panelNumber: 3,
        imageUrl: 'https://signed.example/panel-1.png',
      }),
    }))
    expect(buildAiPrompt).toHaveBeenCalledWith(expect.objectContaining({
      directorStyleDoc: expect.objectContaining({
        storyboardDetail: expect.objectContaining({
          intent: '细化风格',
        }),
      }),
    }))
    expect(llmStreamMock.flush).toHaveBeenCalled()
  })

  it('suggestions fewer than 3 -> explicit error', async () => {
    llmMock.getCompletionContent.mockReturnValueOnce('[{"name":"only-one"}]')
    const payload = { panelId: 'panel-1' }
    const job = buildJob(payload)

    await expect(handleAnalyzeShotVariantsTask(job, payload)).rejects.toThrow('生成的变体数量不足')
  })
})
