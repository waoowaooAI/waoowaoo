import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { addCharacterPromptSuffix, addLocationPromptSuffix, getArtStylePrompt } from '@/lib/constants'
import { type TaskJobData } from '@/lib/task/types'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import {
  assertTaskActive,
  getUserModels,
} from '../utils'
import {
  AnyObj,
  generateLabeledImageToCos,
  parseJsonStringArray,
} from './image-task-handler-shared'

interface GlobalCharacterAppearanceRecord {
  id: string
  appearanceIndex: number
  changeReason: string | null
  description: string | null
  descriptions: string | null
}

interface GlobalCharacterRecord {
  id: string
  name: string
  appearances: GlobalCharacterAppearanceRecord[]
}

interface GlobalLocationImageRecord {
  id: string
  description: string | null
}

interface GlobalLocationRecord {
  id: string
  name: string
  images: GlobalLocationImageRecord[]
}

interface AssetHubImageDb {
  globalCharacter: {
    findFirst(args: Record<string, unknown>): Promise<GlobalCharacterRecord | null>
  }
  globalCharacterAppearance: {
    update(args: Record<string, unknown>): Promise<unknown>
  }
  globalLocation: {
    findFirst(args: Record<string, unknown>): Promise<GlobalLocationRecord | null>
  }
  globalLocationImage: {
    update(args: Record<string, unknown>): Promise<unknown>
  }
}

export async function handleAssetHubImageTask(job: Job<TaskJobData>) {
  const db = prisma as unknown as AssetHubImageDb
  const payload = (job.data.payload || {}) as AnyObj
  const userId = job.data.userId
  const userModels = await getUserModels(userId)
  const artStyle = getArtStylePrompt(
    typeof payload.artStyle === 'string' ? payload.artStyle : undefined,
    job.data.locale,
  )

  if (payload.type === 'character') {
    const characterId = typeof payload.id === 'string' ? payload.id : null
    if (!characterId) throw new Error('Global character id missing')

    const character = await db.globalCharacter.findFirst({
      where: { id: characterId, userId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })

    if (!character) throw new Error('Global character not found')

    const appearanceIndex = Number(payload.appearanceIndex ?? PRIMARY_APPEARANCE_INDEX)
    const appearance = character.appearances.find((appearanceItem) => appearanceItem.appearanceIndex === appearanceIndex)
    if (!appearance) throw new Error('Global character appearance not found')

    const modelId = userModels.characterModel
    if (!modelId) throw new Error('User character model not configured')

    const descriptions = parseJsonStringArray(appearance.descriptions)
    const base = descriptions.length ? descriptions : [appearance.description || '']
    const imageUrls: string[] = []

    for (let i = 0; i < Math.min(3, base.length || 1); i++) {
      const raw = base[i] || base[0]
      const prompt = artStyle ? `${addCharacterPromptSuffix(raw)}，${artStyle}` : addCharacterPromptSuffix(raw)
      const cosKey = await generateLabeledImageToCos({
        job,
        userId,
        modelId,
        prompt,
        label: `${character.name} - ${appearance.changeReason || '形象'}`,
        targetId: `${appearance.id}-${i}`,
        keyPrefix: 'global-character',
        options: {
          aspectRatio: '3:2',
        },
      })
      imageUrls.push(cosKey)
    }

    await assertTaskActive(job, 'persist_global_character_image')
    await db.globalCharacterAppearance.update({
      where: { id: appearance.id },
      data: {
        imageUrls: encodeImageUrls(imageUrls),
        imageUrl: imageUrls[0] || null,
        selectedIndex: null,
      },
    })

    return { type: payload.type, appearanceId: appearance.id, imageCount: imageUrls.length }
  }

  if (payload.type === 'location') {
    const locationId = typeof payload.id === 'string' ? payload.id : null
    if (!locationId) throw new Error('Global location id missing')

    const location = await db.globalLocation.findFirst({
      where: { id: locationId, userId },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
    })

    if (!location || !location.images?.length) throw new Error('Global location not found')

    const modelId = userModels.locationModel
    if (!modelId) throw new Error('User location model not configured')

    for (const image of location.images) {
      if (!image.description) continue
      const prompt = artStyle ? `${addLocationPromptSuffix(image.description)}，${artStyle}` : addLocationPromptSuffix(image.description)

      const cosKey = await generateLabeledImageToCos({
        job,
        userId,
        modelId,
        prompt,
        label: location.name,
        targetId: image.id,
        keyPrefix: 'global-location',
        options: {
          aspectRatio: '1:1',
        },
      })

      await assertTaskActive(job, 'persist_global_location_image')
      await db.globalLocationImage.update({
        where: { id: image.id },
        data: { imageUrl: cosKey },
      })
    }

    return { type: payload.type, locationId: location.id, imageCount: location.images.length }
  }

  throw new Error(`Unsupported asset-hub image type: ${String(payload.type)}`)
}
