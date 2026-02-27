import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData, type TaskType } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => {}),
  getProjectModels: vi.fn(async () => ({ editModel: 'edit-model' })),
  getUserModels: vi.fn(async () => ({ editModel: 'edit-model', analysisModel: 'analysis-model' })),
  resolveImageSourceFromGeneration: vi.fn(async () => 'generated-image-source'),
  stripLabelBar: vi.fn(async () => 'required-reference-image'),
  toSignedUrlIfCos: vi.fn(() => 'https://signed/current-image.png'),
  uploadImageSourceToCos: vi.fn(async () => 'cos/new-image.png'),
  withLabelBar: vi.fn(async (source: unknown) => source),
}))

const outboundImageMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async () => ['normalized-reference-image']),
  normalizeToBase64ForGeneration: vi.fn(async () => 'base64-reference'),
}))

const llmClientMock = vi.hoisted(() => ({
  chatCompletionWithVision: vi.fn(async () => ({ output_text: 'AI_EXTRACTED_DESCRIPTION' })),
  getCompletionContent: vi.fn(() => 'AI_EXTRACTED_DESCRIPTION'),
}))

const promptMock = vi.hoisted(() => ({
  PROMPT_IDS: {
    CHARACTER_IMAGE_TO_DESCRIPTION: 'character_image_to_description',
  },
  buildPrompt: vi.fn(() => 'vision-prompt-template'),
}))

const loggerWarnMock = vi.hoisted(() => vi.fn())
const loggingMock = vi.hoisted(() => ({
  createScopedLogger: vi.fn(() => ({
    warn: loggerWarnMock,
  })),
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
  novelPromotionPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionProject: {
    findUnique: vi.fn(),
  },
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

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundImageMock)
vi.mock('@/lib/llm-client', () => llmClientMock)
vi.mock('@/lib/prompt-i18n', () => promptMock)
vi.mock('@/lib/logging/core', () => loggingMock)
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { handleModifyAssetImageTask } from '@/lib/workers/handlers/image-task-handlers-core'
import { handleAssetHubModifyTask } from '@/lib/workers/handlers/asset-hub-modify-task-handler'

function buildJob(type: TaskType, payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'GlobalCharacter',
      targetId: 'target-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function getUpdateData(callArg: unknown): Record<string, unknown> {
  if (!callArg || typeof callArg !== 'object') return {}
  const maybeData = (callArg as { data?: unknown }).data
  if (!maybeData || typeof maybeData !== 'object') return {}
  return maybeData as Record<string, unknown>
}

describe('modify image with references writes real description', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.characterAppearance.findUnique.mockResolvedValue({
      id: 'appearance-1',
      imageUrls: JSON.stringify(['cos/original-image.png']),
      imageUrl: 'cos/original-image.png',
      selectedIndex: 0,
      changeReason: 'base',
      description: 'old description',
      character: { name: 'Hero' },
    })

    prismaMock.globalCharacter.findFirst.mockResolvedValue({
      id: 'global-character-1',
      name: 'Hero',
      appearances: [
        {
          id: 'global-appearance-1',
          appearanceIndex: 0,
          changeReason: 'base',
          imageUrl: 'cos/original-global.png',
          imageUrls: JSON.stringify(['cos/original-global.png']),
          selectedIndex: 0,
        },
      ],
    })
  })

  it('updates character appearance description from vision output in project modify handler', async () => {
    const job = buildJob(TASK_TYPE.MODIFY_ASSET_IMAGE, {
      type: 'character',
      appearanceId: 'appearance-1',
      modifyPrompt: 'enhance details',
      extraImageUrls: [' https://ref.example/a.png '],
    })

    await handleModifyAssetImageTask(job)

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          aspectRatio: '3:2',
          referenceImages: ['required-reference-image', 'normalized-reference-image'],
        }),
      }),
    )

    const updateArg = prismaMock.characterAppearance.update.mock.calls.at(-1)?.[0]
    const updateData = getUpdateData(updateArg)
    expect(updateData.description).toBe('AI_EXTRACTED_DESCRIPTION')
    expect(updateData.previousDescription).toBe('old description')
    expect(updateData.imageUrl).toBe('cos/new-image.png')
  })

  it('updates asset-hub character description from vision output when reference image exists', async () => {
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/new-global-image.png')

    const job = buildJob(TASK_TYPE.ASSET_HUB_MODIFY, {
      type: 'character',
      id: 'global-character-1',
      appearanceIndex: 0,
      imageIndex: 0,
      modifyPrompt: 'make it sharper',
      extraImageUrls: ['https://ref.example/b.png'],
    })

    await handleAssetHubModifyTask(job)

    const updateArg = prismaMock.globalCharacterAppearance.update.mock.calls.at(-1)?.[0]
    const updateData = getUpdateData(updateArg)
    expect(updateData.description).toBe('AI_EXTRACTED_DESCRIPTION')
    expect(updateData.imageUrl).toBe('cos/new-global-image.png')
    expect(updateData.imageUrls).toBe(JSON.stringify(['cos/new-global-image.png']))
  })
})
