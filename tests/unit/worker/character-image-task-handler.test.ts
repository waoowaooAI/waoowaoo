import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_PROMPT_SUFFIX, getArtStylePrompt } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ characterModel: 'image-model-1', artStyle: 'realistic' })),
  toSignedUrlIfCos: vi.fn((url: string | null | undefined) => (url ? `https://signed.example/${url}` : null)),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async () => ['normalized-primary-ref']),
}))

const prismaMock = vi.hoisted(() => ({
  characterAppearance: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionCharacter: {
    findUnique: vi.fn(),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateLabeledImageToCos: vi.fn<(input: {
    prompt: string
    options?: { referenceImages?: string[]; aspectRatio?: string }
  }) => Promise<string>>(async () => 'cos/character-generated-0.png'),
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
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

import { handleCharacterImageTask } from '@/lib/workers/handlers/character-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'appearance-2'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-character-image-1',
      type: TASK_TYPE.IMAGE_CHARACTER,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'CharacterAppearance',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker character-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.characterAppearance.findUnique.mockResolvedValue({
      id: 'appearance-2',
      characterId: 'character-1',
      appearanceIndex: 1,
      descriptions: JSON.stringify(['角色描述A']),
      description: '角色描述A',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '战斗形态',
      character: { name: 'Hero' },
    })

    prismaMock.characterAppearance.findFirst.mockResolvedValue({
      imageUrl: 'cos/primary.png',
      imageUrls: JSON.stringify(['cos/primary.png']),
    })
  })

  it('characterModel not configured -> explicit error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({ characterModel: '', artStyle: 'realistic' })
    await expect(handleCharacterImageTask(buildJob({}))).rejects.toThrow('Character model not configured')
  })

  it('success path -> uses primary appearance as reference and persists imageUrls', async () => {
    const job = buildJob({ imageIndex: 0 })
    const result = await handleCharacterImageTask(job)

    expect(result).toEqual({
      appearanceId: 'appearance-2',
      imageCount: 1,
      imageUrl: 'cos/character-generated-0.png',
    })

    const generationInput = sharedMock.generateLabeledImageToCos.mock.calls[0]?.[0] as {
      prompt: string
      options?: { referenceImages?: string[]; aspectRatio?: string }
    }
    const realisticStylePrompt = getArtStylePrompt('realistic', 'zh')

    expect(generationInput.prompt).toContain(CHARACTER_PROMPT_SUFFIX)
    expect(generationInput.prompt).toContain(realisticStylePrompt)
    expect(generationInput.prompt.split(CHARACTER_PROMPT_SUFFIX).length - 1).toBe(1)
    expect(generationInput.prompt.split(realisticStylePrompt).length - 1).toBe(1)
    expect(generationInput.options).toEqual(expect.objectContaining({
      referenceImages: ['normalized-primary-ref'],
      aspectRatio: '3:2',
    }))

    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-2' },
      data: {
        imageUrls: JSON.stringify(['cos/character-generated-0.png']),
        imageUrl: 'cos/character-generated-0.png',
      },
    })
  })

  it('payload artStyle overrides project artStyle in prompt', async () => {
    const job = buildJob({ imageIndex: 0, artStyle: 'japanese-anime' })
    await handleCharacterImageTask(job)

    const generationInput = sharedMock.generateLabeledImageToCos.mock.calls[0]?.[0] as {
      prompt: string
    }
    expect(generationInput.prompt).toContain(getArtStylePrompt('japanese-anime', 'zh'))
    expect(generationInput.prompt).not.toContain(getArtStylePrompt('realistic', 'zh'))
  })

  it('invalid payload artStyle -> explicit error', async () => {
    await expect(handleCharacterImageTask(buildJob({ imageIndex: 0, artStyle: 'noir' }))).rejects.toThrow(
      'Invalid artStyle in IMAGE_CHARACTER payload',
    )
  })

  it('uses requested count for grouped generation and expands imageUrls to requested size', async () => {
    sharedMock.generateLabeledImageToCos
      .mockResolvedValueOnce('cos/character-generated-0.png')
      .mockResolvedValueOnce('cos/character-generated-1.png')
      .mockResolvedValueOnce('cos/character-generated-2.png')
      .mockResolvedValueOnce('cos/character-generated-3.png')
      .mockResolvedValueOnce('cos/character-generated-4.png')

    const result = await handleCharacterImageTask(buildJob({ count: 5 }))

    expect(sharedMock.generateLabeledImageToCos).toHaveBeenCalledTimes(5)
    expect(result).toEqual({
      appearanceId: 'appearance-2',
      imageCount: 5,
      imageUrl: 'cos/character-generated-0.png',
    })
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-2' },
      data: {
        imageUrls: JSON.stringify([
          'cos/character-generated-0.png',
          'cos/character-generated-1.png',
          'cos/character-generated-2.png',
          'cos/character-generated-3.png',
          'cos/character-generated-4.png',
        ]),
        imageUrl: 'cos/character-generated-0.png',
      },
    })
  })
})
