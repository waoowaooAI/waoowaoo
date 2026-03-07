import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(),
  getCompletionContent: vi.fn(),
}))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(),
}))

const streamContextMock = vi.hoisted(() => ({
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

vi.mock('@/lib/llm-client', () => llmMock)
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => streamContextMock)
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
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {
    NP_CHARACTER_MODIFY: 'np_character_modify',
    NP_LOCATION_MODIFY: 'np_location_modify',
  },
  buildPrompt: vi.fn((_args: unknown) => 'final-prompt'),
}))

import { handleAssetHubAIModifyTask } from '@/lib/workers/handlers/asset-hub-ai-modify'

function buildJob(type: TaskJobData['type'], payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-asset-ai-modify-1',
      type,
      locale: 'zh',
      projectId: 'global-asset-hub',
      episodeId: null,
      targetType: 'GlobalCharacter',
      targetId: 'target-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker asset-hub-ai-modify behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.getUserModelConfig.mockResolvedValue({ analysisModel: 'llm::analysis-1' })
    llmMock.chatCompletion.mockResolvedValue({ id: 'completion-1' })
    llmMock.getCompletionContent.mockReturnValue('{"prompt":"modified description"}')
  })

  it('missing analysisModel in user config -> explicit error', async () => {
    configMock.getUserModelConfig.mockResolvedValueOnce({ analysisModel: '' })
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER, {
      characterId: 'char-1',
      currentDescription: 'old',
      modifyInstruction: 'new',
    })

    await expect(handleAssetHubAIModifyTask(job)).rejects.toThrow('请先在用户配置中设置分析模型')
  })

  it('unsupported type -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.IMAGE_CHARACTER, {
      characterId: 'char-1',
      currentDescription: 'old',
      modifyInstruction: 'new',
    })

    await expect(handleAssetHubAIModifyTask(job)).rejects.toThrow('Unsupported task type')
  })

  it('character success -> parses JSON prompt and returns modifiedDescription', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER, {
      characterId: 'char-1',
      currentDescription: 'old character description',
      modifyInstruction: 'add armor details',
    })

    const result = await handleAssetHubAIModifyTask(job)

    expect(llmMock.chatCompletion).toHaveBeenCalledWith(
      'user-1',
      'llm::analysis-1',
      [{ role: 'user', content: 'final-prompt' }],
      expect.objectContaining({
        projectId: 'asset-hub',
        action: 'ai_modify_character',
      }),
    )
    expect(result).toEqual({
      success: true,
      modifiedDescription: 'modified description',
    })
    expect(llmStreamMock.flush).toHaveBeenCalled()
  })

  it('location success -> requires locationName and returns modifiedDescription', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION, {
      locationId: 'loc-1',
      locationName: 'Old Town',
      currentDescription: 'old location description',
      modifyInstruction: 'add more fog',
    })

    const result = await handleAssetHubAIModifyTask(job)
    expect(result).toEqual({
      success: true,
      modifiedDescription: 'modified description',
    })
  })
})
