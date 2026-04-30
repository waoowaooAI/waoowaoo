import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_ASSET_IMAGE_RATIO, CHARACTER_PROMPT_SUFFIX, PROP_IMAGE_RATIO, PROP_PROMPT_SUFFIX } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const workersUtilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => {}),
  getUserModels: vi.fn(async () => ({
    characterModel: 'character-model-1',
    locationModel: 'location-model-1',
  })),
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findFirst: vi.fn(),
  },
  globalCharacterAppearance: {
    update: vi.fn(async () => ({})),
  },
  globalLocation: {
    findFirst: vi.fn(),
  },
  globalLocationImage: {
    update: vi.fn(async () => ({})),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateCleanImageToStorage: vi.fn(async () => 'cos/generated-character.png'),
  parseJsonStringArray: vi.fn(() => []),
}))

vi.mock('@/lib/workers/utils', () => workersUtilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateCleanImageToStorage: sharedMock.generateCleanImageToStorage,
    parseJsonStringArray: sharedMock.parseJsonStringArray,
  }
})

import { handleAssetHubImageTask } from '@/lib/workers/handlers/asset-hub-image-task-handler'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-asset-hub-image-1',
      type: TASK_TYPE.ASSET_HUB_IMAGE,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'GlobalCharacterAppearance',
      targetId: 'appearance-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function countOccurrences(input: string, target: string) {
  if (!target) return 0
  return input.split(target).length - 1
}

describe('asset hub character image prompt suffix regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.globalCharacter.findFirst.mockResolvedValue({
      id: 'global-character-1',
      name: 'Hero',
      appearances: [
        {
          id: 'appearance-1',
          appearanceIndex: 0,
          changeReason: 'base',
          description: '主角，黑发，冷静',
          descriptions: null,
        },
      ],
    })
  })

  it('keeps character prompt suffix in actual generation prompt', async () => {
    const job = buildJob({
      type: 'character',
      id: 'global-character-1',
      appearanceIndex: 0,
    })

    await handleAssetHubImageTask(job)

    const generationCall = sharedMock.generateCleanImageToStorage.mock.calls[0] as unknown as [{
      prompt?: string
      options?: { aspectRatio?: string }
      label?: string
    }] | undefined
    const callArg = generationCall?.[0]
    const prompt = callArg?.prompt || ''

    expect(prompt).toContain('主角，黑发，冷静')
    expect(prompt).toContain(CHARACTER_PROMPT_SUFFIX)
    expect(countOccurrences(prompt, CHARACTER_PROMPT_SUFFIX)).toBe(1)
    expect(callArg?.options).toEqual(expect.objectContaining({ aspectRatio: CHARACTER_ASSET_IMAGE_RATIO }))
    expect(callArg?.label).toBeUndefined()
  })

  it('honors requested count for global location generation', async () => {
    prismaMock.globalLocation.findFirst.mockResolvedValueOnce({
      id: 'global-location-1',
      name: 'Old Town',
      images: [
        { id: 'global-location-image-1', description: '雨夜街道 A' },
        { id: 'global-location-image-2', description: '雨夜街道 B' },
        { id: 'global-location-image-3', description: '雨夜街道 C' },
      ],
    })

    const result = await handleAssetHubImageTask(buildJob({
      type: 'location',
      id: 'global-location-1',
      count: 1,
    }))

    expect(result).toEqual({
      type: 'location',
      locationId: 'global-location-1',
      imageCount: 1,
    })
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(1)
    expect(prismaMock.globalLocationImage.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.globalLocationImage.update).toHaveBeenCalledWith({
      where: { id: 'global-location-image-1' },
      data: { imageUrl: 'cos/generated-character.png' },
    })
  })

  it('keeps the prop prompt suffix in global prop generation prompts', async () => {
    prismaMock.globalLocation.findFirst.mockResolvedValueOnce({
      id: 'global-prop-1',
      name: 'Silver Cutlery',
      images: [
        {
          id: 'global-prop-image-1',
          description: '银质餐具套装，包含刀叉与汤匙，线条简洁，金属冷白光泽',
        },
      ],
    })

    await handleAssetHubImageTask(buildJob({
      type: 'prop',
      id: 'global-prop-1',
    }))

    const generationCall = sharedMock.generateCleanImageToStorage.mock.calls[0] as unknown as [{
      prompt?: string
      options?: { aspectRatio?: string }
      label?: string
    }] | undefined
    const callArg = generationCall?.[0]
    const prompt = callArg?.prompt || ''

    expect(prompt).toContain(PROP_PROMPT_SUFFIX)
    expect(countOccurrences(prompt, PROP_PROMPT_SUFFIX)).toBe(1)
    expect(callArg?.options).toEqual(expect.objectContaining({ aspectRatio: PROP_IMAGE_RATIO }))
    expect(callArg?.label).toBeUndefined()
  })
})
