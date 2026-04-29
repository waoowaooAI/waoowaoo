import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const aiRuntimeMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(async () => ({
    text: '扩写后的完整故事内容',
    reasoning: '',
  })),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/ai-exec/engine', () => aiRuntimeMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { SCRIPT_EXPAND_STORY: 'script-expand-story' },
  buildAiPrompt: vi.fn(() => 'story-expand-prompt'),
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
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

import { handleAiStoryExpandTask } from '@/lib/workers/handlers/ai-story-expand'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-ai-story-expand-1',
      type: TASK_TYPE.AI_STORY_EXPAND,
      locale: 'zh',
      projectId: 'home-ai-write',
      targetType: 'HomeAiStoryExpand',
      targetId: 'user-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker ai-story-expand behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('missing prompt -> explicit error', async () => {
    const job = buildJob({ prompt: '   ', analysisModel: 'provider::analysis-model' })
    await expect(handleAiStoryExpandTask(job)).rejects.toThrow('prompt is required')
  })

  it('missing analysis model -> explicit error', async () => {
    const job = buildJob({ prompt: '宫廷复仇女主回京' })
    await expect(handleAiStoryExpandTask(job)).rejects.toThrow('analysisModel is required')
  })

  it('success path -> returns expanded text without touching episode persistence', async () => {
    const job = buildJob({ prompt: '宫廷复仇女主回京', analysisModel: 'provider::analysis-model' })
    const result = await handleAiStoryExpandTask(job)

    expect(result).toEqual({
      expandedText: '扩写后的完整故事内容',
    })
    expect(aiRuntimeMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'provider::analysis-model',
      projectId: 'home-ai-write',
      action: 'ai_story_expand',
    }))
  })
})
