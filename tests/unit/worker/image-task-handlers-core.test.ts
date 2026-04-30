import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCATION_IMAGE_RATIO, PROP_IMAGE_RATIO } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => {}),
  getProjectModels: vi.fn(async () => ({ editModel: 'edit-model' })),
  getUserModels: vi.fn(async () => ({ editModel: 'edit-model', analysisModel: 'analysis-model' })),
  resolveImageSourceFromGeneration: vi.fn(async () => 'generated-image-source'),
  toSignedUrlIfCos: vi.fn(() => 'https://signed/current-image.png'),
  uploadImageSourceToCos: vi.fn(async () => 'cos/new-image.png'),
}))

const outboundImageMock = vi.hoisted(() => ({
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async () => ['normalized-reference-image']),
  normalizeToBase64ForGeneration: vi.fn(async () => 'base64-required-reference'),
}))

const sharedMock = vi.hoisted(() => ({
  resolveNovelData: vi.fn(async () => ({ videoRatio: '16:9' })),
}))

const prismaMock = vi.hoisted(() => ({
  characterAppearance: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  locationImage: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  projectPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundImageMock)
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    resolveNovelData: sharedMock.resolveNovelData,
  }
})

import { handleModifyAssetImageTask } from '@/lib/workers/handlers/image-task-handlers-core'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.MODIFY_ASSET_IMAGE,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'ProjectPanel',
      targetId: 'target-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function readUpdateData(arg: unknown): Record<string, unknown> {
  if (!arg || typeof arg !== 'object') return {}
  const data = (arg as { data?: unknown }).data
  if (!data || typeof data !== 'object') return {}
  return data as Record<string, unknown>
}

describe('worker image-task-handlers-core', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails fast when modify task payload is incomplete', async () => {
    const job = buildJob({})
    await expect(handleModifyAssetImageTask(job)).rejects.toThrow('modify task missing type/modifyPrompt')
  })

  it('updates location image with expected generation options and persistence payload', async () => {
    prismaMock.locationImage.findUnique.mockResolvedValue({
      id: 'location-image-1',
      locationId: 'location-1',
      imageUrl: 'cos/location-old.png',
      location: { name: 'Old Town' },
    })

    const job = buildJob({
      type: 'location',
      locationImageId: 'location-image-1',
      modifyPrompt: 'add heavy rain',
      extraImageUrls: [' https://example.com/location-ref.png '],
      generationOptions: { resolution: '1536x1024' },
    })

    const result = await handleModifyAssetImageTask(job)
    expect(result).toEqual({
      type: 'location',
      locationImageId: 'location-image-1',
      imageUrl: 'cos/new-image.png',
    })

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          aspectRatio: LOCATION_IMAGE_RATIO,
          resolution: '1536x1024',
          referenceImages: ['https://signed/current-image.png', 'normalized-reference-image'],
        }),
      }),
    )

    const locationUpdateCall = prismaMock.locationImage.update.mock.calls.at(-1) as [unknown] | undefined
    const updateArg = locationUpdateCall?.[0]
    const updateData = readUpdateData(updateArg)
    expect(updateData.previousImageUrl).toBe('cos/location-old.png')
    expect(updateData.imageUrl).toBe('cos/new-image.png')
  })

  it('uses the character-matching aspect ratio when modifying project prop images', async () => {
    prismaMock.locationImage.findUnique.mockResolvedValueOnce({
      id: 'prop-image-1',
      locationId: 'prop-1',
      imageUrl: 'cos/prop-old.png',
      description: 'silver prop',
      previousDescription: null,
      location: { name: 'Silver Prop' },
    })

    await handleModifyAssetImageTask(buildJob({
      type: 'prop',
      locationImageId: 'prop-image-1',
      modifyPrompt: 'make it brushed silver',
      generationOptions: { resolution: '1536x1024' },
    }))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          aspectRatio: PROP_IMAGE_RATIO,
          resolution: '1536x1024',
        }),
      }),
    )
  })

  it('updates storyboard panel image and keeps candidateImages reset', async () => {
    prismaMock.projectPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      imageUrl: 'cos/panel-old.png',
      previousImageUrl: null,
    })

    const job = buildJob({
      type: 'storyboard',
      panelId: 'panel-1',
      modifyPrompt: 'cinematic backlight',
      selectedAssets: [{ imageUrl: 'https://example.com/asset-ref.png' }],
      extraImageUrls: ['https://example.com/extra-ref.png'],
      generationOptions: { resolution: '2048x1152' },
    })

    const result = await handleModifyAssetImageTask(job)
    expect(result).toEqual({
      type: 'storyboard',
      panelId: 'panel-1',
      imageUrl: 'cos/new-image.png',
    })

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          aspectRatio: '16:9',
          resolution: '2048x1152',
          referenceImages: [
            'base64-required-reference',
            'normalized-reference-image',
          ],
        }),
      }),
    )

    const panelUpdateCall = prismaMock.projectPanel.update.mock.calls.at(-1) as [unknown] | undefined
    const updateArg = panelUpdateCall?.[0]
    const updateData = readUpdateData(updateArg)
    expect(updateData.previousImageUrl).toBe('cos/panel-old.png')
    expect(updateData.imageUrl).toBe('cos/new-image.png')
    expect(updateData.candidateImages).toBeNull()
  })
})
