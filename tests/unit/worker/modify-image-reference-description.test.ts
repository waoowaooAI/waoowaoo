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
  normalizeReferenceImagesForGeneration: vi.fn(async (input?: string[]) => input?.map((item) => item.trim()) || []),
  normalizeToBase64ForGeneration: vi.fn(async () => 'base64-reference'),
}))

const aiRuntimeMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(async () => ({ text: '{"prompt":"TEXT_UPDATED_DESCRIPTION"}' })),
  executeAiVisionStep: vi.fn(async () => ({ text: '{"prompt":"VISION_UPDATED_DESCRIPTION"}' })),
}))

const promptMock = vi.hoisted(() => ({
  PROMPT_IDS: {
    NP_CHARACTER_DESCRIPTION_UPDATE: 'np_character_description_update',
    NP_LOCATION_DESCRIPTION_UPDATE: 'np_location_description_update',
  },
  buildPrompt: vi.fn(({ promptId }: { promptId: string }) => `${promptId}-prompt`),
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
vi.mock('@/lib/ai-runtime', () => aiRuntimeMock)
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

describe('modify image syncs descriptions after edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.characterAppearance.findUnique.mockResolvedValue({
      id: 'appearance-1',
      imageUrls: JSON.stringify(['cos/original-image.png', 'cos/original-image-2.png']),
      imageUrl: 'cos/original-image.png',
      selectedIndex: 1,
      changeReason: 'base',
      description: 'old primary description',
      descriptions: JSON.stringify(['old primary description', 'old variant description']),
      character: { name: 'Hero' },
    })

    prismaMock.locationImage.findFirst.mockResolvedValue({
      id: 'location-image-1',
      locationId: 'location-1',
      description: 'old location description',
      imageUrl: 'cos/original-location.png',
      previousDescription: null,
      location: { name: 'Old Town' },
    })

    prismaMock.globalCharacter.findFirst.mockResolvedValue({
      id: 'global-character-1',
      name: 'Hero',
      appearances: [
        {
          id: 'global-appearance-1',
          appearanceIndex: 0,
          changeReason: 'base',
          description: 'global primary description',
          descriptions: JSON.stringify(['global primary description', 'global variant description']),
          imageUrl: 'cos/original-global.png',
          imageUrls: JSON.stringify(['cos/original-global.png', 'cos/original-global-2.png']),
          selectedIndex: 1,
          previousDescription: null,
          previousDescriptions: null,
        },
      ],
    })

    prismaMock.globalLocation.findFirst.mockResolvedValue({
      id: 'global-location-1',
      name: 'Old Town',
      images: [
        {
          id: 'global-location-image-1',
          imageIndex: 0,
          description: 'global location description',
          imageUrl: 'cos/original-global-location.png',
          previousDescription: null,
        },
      ],
    })
  })

  it('syncs project character descriptions for pure text edits', async () => {
    const job = buildJob(TASK_TYPE.MODIFY_ASSET_IMAGE, {
      type: 'character',
      appearanceId: 'appearance-1',
      imageIndex: 1,
      modifyPrompt: '给角色增加更复杂的甲胄细节',
    })

    await handleModifyAssetImageTask(job)

    expect(aiRuntimeMock.executeAiTextStep).toHaveBeenCalledTimes(1)
    expect(aiRuntimeMock.executeAiVisionStep).not.toHaveBeenCalled()

    const characterUpdateCall = prismaMock.characterAppearance.update.mock.calls.at(-1) as [unknown] | undefined
    const updateArg = characterUpdateCall?.[0]
    const updateData = getUpdateData(updateArg)
    expect(updateData.previousDescription).toBe('old primary description')
    expect(updateData.previousDescriptions).toBe(JSON.stringify(['old primary description', 'old variant description']))
    expect(updateData.description).toBe('old primary description')
    expect(updateData.descriptions).toBe(JSON.stringify(['old primary description', 'TEXT_UPDATED_DESCRIPTION']))
    expect(updateData.imageUrl).toBe('cos/new-image.png')
  })

  it('syncs asset-hub character descriptions for reference-image edits and preserves sibling variants', async () => {
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/new-global-image.png')

    const job = buildJob(TASK_TYPE.ASSET_HUB_MODIFY, {
      type: 'character',
      id: 'global-character-1',
      appearanceIndex: 0,
      imageIndex: 1,
      modifyPrompt: '把服装改成更锐利的深色铠甲',
      extraImageUrls: ['https://ref.example/b.png'],
    })

    await handleAssetHubModifyTask(job)

    expect(aiRuntimeMock.executeAiVisionStep).toHaveBeenCalledTimes(1)

    const globalCharacterUpdateCall = prismaMock.globalCharacterAppearance.update.mock.calls.at(-1) as [unknown] | undefined
    const updateArg = globalCharacterUpdateCall?.[0]
    const updateData = getUpdateData(updateArg)
    expect(updateData.previousDescription).toBe('global primary description')
    expect(updateData.previousDescriptions).toBe(JSON.stringify(['global primary description', 'global variant description']))
    expect(updateData.description).toBe('global primary description')
    expect(updateData.descriptions).toBe(JSON.stringify(['global primary description', 'VISION_UPDATED_DESCRIPTION']))
    expect(updateData.imageUrl).toBe('cos/new-global-image.png')
    expect(updateData.imageUrls).toBe(JSON.stringify(['cos/original-global.png', 'cos/new-global-image.png']))
  })

  it('syncs project location descriptions for pure text edits', async () => {
    aiRuntimeMock.executeAiTextStep.mockResolvedValueOnce({ text: '{"prompt":"TEXT_UPDATED_LOCATION"}' })

    const job = buildJob(TASK_TYPE.MODIFY_ASSET_IMAGE, {
      type: 'location',
      locationId: 'location-1',
      imageIndex: 0,
      modifyPrompt: '增加更浓的晨雾和老城石墙细节',
    })

    await handleModifyAssetImageTask(job)

    const locationUpdateCall = prismaMock.locationImage.update.mock.calls.at(-1) as [unknown] | undefined
    const updateArg = locationUpdateCall?.[0]
    const updateData = getUpdateData(updateArg)
    expect(updateData.previousDescription).toBe('old location description')
    expect(updateData.description).toBe('TEXT_UPDATED_LOCATION')
    expect(updateData.imageUrl).toBe('cos/new-image.png')
  })

  it('syncs asset-hub location descriptions for reference-image edits', async () => {
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/new-global-location-image.png')
    aiRuntimeMock.executeAiVisionStep.mockResolvedValueOnce({ text: '{"prompt":"VISION_UPDATED_LOCATION"}' })

    const job = buildJob(TASK_TYPE.ASSET_HUB_MODIFY, {
      type: 'location',
      id: 'global-location-1',
      imageIndex: 0,
      modifyPrompt: '改成潮湿阴冷的石砌街道',
      extraImageUrls: ['https://ref.example/location.png'],
    })

    await handleAssetHubModifyTask(job)

    const globalLocationUpdateCall = prismaMock.globalLocationImage.update.mock.calls.at(-1) as [unknown] | undefined
    const updateArg = globalLocationUpdateCall?.[0]
    const updateData = getUpdateData(updateArg)
    expect(updateData.previousDescription).toBe('global location description')
    expect(updateData.description).toBe('VISION_UPDATED_LOCATION')
    expect(updateData.imageUrl).toBe('cos/new-global-location-image.png')
  })
})
