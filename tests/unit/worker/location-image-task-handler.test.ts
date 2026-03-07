import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getArtStylePrompt } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ locationModel: 'location-model-1', artStyle: 'japanese-anime' })),
}))

const prismaMock = vi.hoisted(() => ({
  locationImage: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionLocation: {
    findUnique: vi.fn(),
    findMany: vi.fn(async () => []),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateLabeledImageToCos: vi.fn(async () => 'cos/location-generated-1.png'),
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateLabeledImageToCos: sharedMock.generateLabeledImageToCos,
  }
})

import { handleLocationImageTask } from '@/lib/workers/handlers/location-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'location-image-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-location-image-1',
      type: TASK_TYPE.IMAGE_LOCATION,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'LocationImage',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker location-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.locationImage.findUnique.mockResolvedValue({
      id: 'location-image-1',
      locationId: 'location-1',
      imageIndex: 0,
      description: '雨夜街道',
      location: { name: 'Old Town' },
    })

    prismaMock.novelPromotionLocation.findUnique.mockResolvedValue({
      id: 'location-1',
      name: 'Old Town',
      images: [
        {
          id: 'location-image-1',
          locationId: 'location-1',
          imageIndex: 0,
          description: '雨夜街道',
        },
      ],
    })
  })

  it('locationModel missing -> explicit error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({ locationModel: '', artStyle: 'japanese-anime' })
    await expect(handleLocationImageTask(buildJob({}))).rejects.toThrow('Location model not configured')
  })

  it('success path -> generates and persists concrete location image url', async () => {
    const result = await handleLocationImageTask(buildJob({ imageIndex: 0 }))
    const animeStylePrompt = getArtStylePrompt('japanese-anime', 'zh')

    expect(result).toEqual({
      updated: 1,
      locationIds: ['location-1'],
    })

    expect(sharedMock.generateLabeledImageToCos).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `雨夜街道，${animeStylePrompt}`,
        label: 'Old Town',
        targetId: 'location-image-1',
        options: expect.objectContaining({ aspectRatio: '1:1' }),
      }),
    )
    const generationCall = sharedMock.generateLabeledImageToCos.mock.calls[0] as unknown as [{ prompt: string }] | undefined
    expect(generationCall).toBeTruthy()
    if (!generationCall) throw new Error('expected generateLabeledImageToCos call')
    const generationInput = generationCall[0]
    expect(generationInput.prompt.split(animeStylePrompt).length - 1).toBe(1)

    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'location-image-1' },
      data: { imageUrl: 'cos/location-generated-1.png' },
    })
  })

  it('payload artStyle overrides project artStyle in prompt', async () => {
    await handleLocationImageTask(buildJob({ imageIndex: 0, artStyle: 'realistic' }))

    expect(sharedMock.generateLabeledImageToCos).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `雨夜街道，${getArtStylePrompt('realistic', 'zh')}`,
      }),
    )
  })

  it('invalid payload artStyle -> explicit error', async () => {
    await expect(handleLocationImageTask(buildJob({ imageIndex: 0, artStyle: 'anime' }))).rejects.toThrow(
      'Invalid artStyle in IMAGE_LOCATION payload',
    )
  })
})
