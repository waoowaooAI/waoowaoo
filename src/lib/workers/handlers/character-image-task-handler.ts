import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { CHARACTER_ASSET_IMAGE_RATIO, addCharacterPromptSuffix, getArtStylePrompt, isArtStyleValue, PRIMARY_APPEARANCE_INDEX, type ArtStyleValue } from '@/lib/constants'
import { createScopedLogger } from '@/lib/logging/core'
import { type TaskJobData } from '@/lib/task/types'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
} from '../utils'
import { normalizeOptionalReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  AnyObj,
  generateProjectLabeledImageToStorage,
  parseImageUrls,
  parseJsonStringArray,
  pickFirstString,
} from './image-task-handler-shared'

function resolvePayloadArtStyle(payload: AnyObj): ArtStyleValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(payload, 'artStyle')) return undefined
  const parsedArtStyle = typeof payload.artStyle === 'string' ? payload.artStyle.trim() : ''
  if (!isArtStyleValue(parsedArtStyle)) {
    throw new Error('Invalid artStyle in IMAGE_CHARACTER payload')
  }
  return parsedArtStyle
}

interface CharacterAppearanceRecord {
  id: string
  characterId: string
  appearanceIndex: number
  descriptions: string | null
  description: string | null
  imageUrls: string | null
  selectedIndex: number | null
  imageUrl: string | null
  changeReason: string | null
}

interface CharacterAppearanceWithCharacter extends CharacterAppearanceRecord {
  character: {
    name: string
  }
}

interface CharacterRecord {
  id: string
  name: string
  appearances: CharacterAppearanceRecord[]
}

interface PrimaryAppearanceRecord {
  imageUrl: string | null
  imageUrls: string | null
  selectedIndex: number | null
}

interface CharacterImageDb {
  characterAppearance: {
    findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceWithCharacter | null>
    findFirst(args: Record<string, unknown>): Promise<PrimaryAppearanceRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  projectCharacter: {
    findUnique(args: Record<string, unknown>): Promise<CharacterRecord | null>
  }
}

const logger = createScopedLogger({ module: 'worker.character-image' })
const STORAGE_KEY_PREFIXES = ['images/', 'video/', 'voice/'] as const

function isStorageKeyLike(value: string): boolean {
  return STORAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function resolvePrimaryReferenceInput(primaryAppearance: PrimaryAppearanceRecord): string | null {
  const imageUrls = parseImageUrls(primaryAppearance.imageUrls, 'characterAppearance.imageUrls')
  const selected = primaryAppearance.selectedIndex !== null
    ? imageUrls[primaryAppearance.selectedIndex]
    : ''
  const firstInList = imageUrls.find((url) => typeof url === 'string' && url.trim().length > 0) || ''

  const candidates = [selected, firstInList, primaryAppearance.imageUrl]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)

  const storageKey = candidates.find((value) => isStorageKeyLike(value))
  return storageKey || candidates[0] || null
}

export async function handleCharacterImageTask(job: Job<TaskJobData>) {
  const db = prisma as unknown as CharacterImageDb
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const models = await getProjectModels(projectId, userId)
  const modelId = models.characterModel
  if (!modelId) throw new Error('Character model not configured')

  const appearanceId = pickFirstString(job.data.targetId, payload.appearanceId)
  let appearance: CharacterAppearanceRecord | null = null
  let characterName = '角色'

  if (appearanceId) {
    const appearanceWithCharacter = await db.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (appearanceWithCharacter) {
      appearance = appearanceWithCharacter
      characterName = appearanceWithCharacter.character.name
    }
  }

  const characterId = typeof payload.id === 'string' ? payload.id : null
  if (!appearance && characterId) {
    const character = await db.projectCharacter.findUnique({
      where: { id: characterId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    appearance = character?.appearances?.[0] || null
    if (character && appearance) {
      characterName = character.name
    }
  }

  if (!appearance) throw new Error('Character appearance not found')

  const payloadArtStyle = resolvePayloadArtStyle(payload)
  const artStyle = getArtStylePrompt(payloadArtStyle ?? models.artStyle, job.data.locale)
  const descriptions = parseJsonStringArray(appearance.descriptions)
  const baseDescriptions = descriptions.length > 0 ? descriptions : [appearance.description || '']

  // 子形象（不是主形象）生成时，引用主形象图片保持一致性
  const primaryReferenceInputs: string[] = []
  if (appearance.appearanceIndex > PRIMARY_APPEARANCE_INDEX) {
    const primaryAppearance = await db.characterAppearance.findFirst({
      where: {
        characterId: appearance.characterId,
        appearanceIndex: PRIMARY_APPEARANCE_INDEX,
      },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })
    if (primaryAppearance) {
      const primaryReferenceInput = resolvePrimaryReferenceInput(primaryAppearance)
      if (primaryReferenceInput) {
        primaryReferenceInputs.push(primaryReferenceInput)
      }
    }
  }
  const primaryReferenceImages = await normalizeOptionalReferenceImagesForGeneration(primaryReferenceInputs, {
    context: {
      taskType: 'image_character',
      appearanceId: appearance.id,
      primaryAppearanceIndex: PRIMARY_APPEARANCE_INDEX,
      targetId: job.data.targetId,
    },
    onIssue: (issue) => {
      logger.warn({
        message: 'primary reference normalize issue',
        details: {
          issue,
          candidateCount: primaryReferenceInputs.length,
        },
      })
    },
  })

  const singleIndex = payload.imageIndex ?? payload.descriptionIndex
  const count = normalizeImageGenerationCount('character', payload.count)
  const indexes = singleIndex !== undefined
    ? [Number(singleIndex)]
    : Array.from({ length: count }, (_value, index) => index)

  const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
  const nextImageUrls = [...imageUrls]
  const label = `${characterName} - ${appearance.changeReason || '形象'}`

  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i]
    const raw = baseDescriptions[index] || baseDescriptions[0]
    const prompt = artStyle ? `${addCharacterPromptSuffix(raw)}，${artStyle}` : addCharacterPromptSuffix(raw)

    await reportTaskProgress(job, 15 + Math.floor((i / Math.max(indexes.length, 1)) * 55), {
      stage: 'generate_character_image',
      index,
    })

    const options: {
      referenceImages?: string[]
      aspectRatio: string
    } = {
      aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
    }
    if (primaryReferenceImages.length > 0) {
      options.referenceImages = primaryReferenceImages
    }

    const imageKey = await generateProjectLabeledImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      label,
      targetId: `${appearance.id}-${index}`,
      keyPrefix: 'character',
      options,
    })

    while (nextImageUrls.length <= index) {
      nextImageUrls.push('')
    }
    nextImageUrls[index] = imageKey
  }

  const selectedIndex = appearance.selectedIndex
  const fallbackMain = nextImageUrls.find((url) => typeof url === 'string' && url) || appearance.imageUrl
  const mainImage = selectedIndex !== null && selectedIndex !== undefined && nextImageUrls[selectedIndex]
    ? nextImageUrls[selectedIndex]
    : fallbackMain

  await assertTaskActive(job, 'persist_character_image')
  await db.characterAppearance.update({
    where: { id: appearance.id },
    data: {
      imageUrls: encodeImageUrls(nextImageUrls),
      imageUrl: mainImage || null,
    },
  })

  return {
    appearanceId: appearance.id,
    imageCount: nextImageUrls.filter(Boolean).length,
    imageUrl: mainImage || null,
  }
}
