import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(),
}))

const assetUtilsMock = vi.hoisted(() => ({
  aiDesign: vi.fn(),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/asset-utils', () => assetUtilsMock)
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: workerMock.assertTaskActive,
}))

import { handleAssetHubAIDesignTask } from '@/lib/workers/handlers/asset-hub-ai-design'

function buildJob(type: TaskJobData['type'], payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-asset-ai-design-1',
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

describe('worker asset-hub-ai-design behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.getUserModelConfig.mockResolvedValue({ analysisModel: 'llm::analysis-default' })
    assetUtilsMock.aiDesign.mockResolvedValue({
      success: true,
      prompt: 'generated prompt',
    })
  })

  it('missing userInstruction -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER, {})
    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('userInstruction is required')
  })

  it('unsupported task type -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.IMAGE_CHARACTER, { userInstruction: 'design a hero' })
    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('Unsupported asset hub ai design task type')
  })

  it('success uses payload analysisModel override and character assetType', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER, {
      userInstruction: '  design a heroic character  ',
      analysisModel: '  llm::analysis-override  ',
    })

    const result = await handleAssetHubAIDesignTask(job)

    expect(assetUtilsMock.aiDesign).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      analysisModel: 'llm::analysis-override',
      userInstruction: 'design a heroic character',
      assetType: 'character',
      projectId: 'global-asset-hub',
      skipBilling: true,
    }))
    expect(result).toEqual({ prompt: 'generated prompt' })
  })

  it('location type success -> passes location assetType', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION, {
      userInstruction: 'design a rainy alley',
    })

    await handleAssetHubAIDesignTask(job)

    expect(assetUtilsMock.aiDesign).toHaveBeenCalledWith(expect.objectContaining({
      assetType: 'location',
      analysisModel: 'llm::analysis-default',
    }))
  })
})
