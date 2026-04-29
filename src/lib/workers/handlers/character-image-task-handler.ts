import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { CHARACTER_ASSET_IMAGE_RATIO, addCharacterPromptSuffix, PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { resolveProjectImageStyleForTask } from '@/lib/image-generation/style'
import { type TaskJobData } from '@/lib/task/types'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  toSignedUrlIfCos,
} from '../utils'
import { normalizeOptionalReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  AnyObj,
  generateProjectLabeledImageToStorage,
  parseImageUrls,
  parseJsonStringArray,
  pickFirstString,
} from './image-task-handler-shared'

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

  const artStyle = (await resolveProjectImageStyleForTask({
    projectId,
    userId,
    locale: job.data.locale,
    artStyleOverride: payload.artStyle,
    invalidOverrideMessage: 'Invalid artStyle in IMAGE_CHARACTER payload',
  })).prompt
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
      const primaryImageUrls = parseImageUrls(primaryAppearance.imageUrls, 'primaryAppearance.imageUrls')
      const selectedIndex = primaryAppearance.selectedIndex
      const selectedKey = typeof selectedIndex === 'number' ? primaryImageUrls[selectedIndex] : null
      const fallbackKey = primaryImageUrls.find((value) => typeof value === 'string' && value) || primaryAppearance.imageUrl
      const primaryKey = (typeof selectedKey === 'string' && selectedKey) ? selectedKey : fallbackKey
      const primaryMainUrl = primaryKey ? toSignedUrlIfCos(primaryKey, 3600) : null
      if (primaryMainUrl) primaryReferenceInputs.push(primaryMainUrl)
    }
  }
  const primaryReferenceImages = await normalizeOptionalReferenceImagesForGeneration(primaryReferenceInputs, {
    context: { taskType: String(job.data.type), scope: 'character.primaryAppearance' },
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
