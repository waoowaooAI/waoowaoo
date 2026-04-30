import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { LOCATION_IMAGE_RATIO, PROP_IMAGE_RATIO, addLocationPromptSuffix, addPropPromptSuffix } from '@/lib/constants'
import { resolveProjectImageStyleForTask } from '@/lib/image-generation/style'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
} from '../utils'
import {
  AnyObj,
  generateCleanImageToStorage,
  pickFirstString,
} from './image-task-handler-shared'
import { buildLocationImagePromptCore } from '@/lib/location-image-prompt'
import { buildPropImagePromptCore } from '@/lib/prop-image-prompt'

interface LocationImageRecord {
  id: string
  locationId: string
  description: string | null
  availableSlots?: string | null
  imageIndex: number
  location?: { name: string } | null
}

interface LocationWithImages {
  id: string
  name: string
  images?: LocationImageRecord[]
}

interface LocationImageTaskDb {
  locationImage: {
    findUnique(args: Record<string, unknown>): Promise<LocationImageRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  projectLocation: {
    findUnique(args: Record<string, unknown>): Promise<LocationWithImages | null>
  }
}

function resolveRequestedLocationCount(payload: AnyObj): number | null {
  if (!Object.prototype.hasOwnProperty.call(payload, 'count')) return null
  return normalizeImageGenerationCount('location', payload.count)
}

export async function handleLocationImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const db = prisma as unknown as LocationImageTaskDb
  const models = await getProjectModels(projectId, userId)
  const modelId = models.locationModel
  if (!modelId) throw new Error('Location model not configured')
  const requestedCount = resolveRequestedLocationCount(payload)

  const artStyle = (await resolveProjectImageStyleForTask({
    projectId,
    userId,
    locale: job.data.locale,
    artStyleOverride: payload.artStyle,
    invalidOverrideMessage: 'Invalid artStyle in IMAGE_LOCATION payload',
  })).prompt
  const assetType = payload.type === 'prop' ? 'prop' : 'location'

  // targetId may be locationId (group) or locationImageId (single)
  const maybeLocationImage = await db.locationImage.findUnique({
    where: { id: job.data.targetId },
    include: { location: true },
  })

  let locationImages: LocationImageRecord[] = []

  if (maybeLocationImage) {
    if (payload.imageIndex !== undefined) {
      locationImages = [maybeLocationImage]
    } else {
      const location = await db.projectLocation.findUnique({
        where: { id: maybeLocationImage.locationId },
        include: { images: { orderBy: { imageIndex: 'asc' } } },
      })
      const orderedImages = location?.images || [maybeLocationImage]
      locationImages = requestedCount === null ? orderedImages : orderedImages.slice(0, requestedCount)
    }
  } else {
    const locationId = pickFirstString(payload.id, payload.locationId, job.data.targetId)
    if (!locationId) throw new Error('Location id missing')

    const location = await db.projectLocation.findUnique({
      where: { id: locationId },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
    })

    if (!location || !location.images?.length) {
      throw new Error('Location images not found')
    }

    if (payload.imageIndex !== undefined) {
      const image = location.images.find((it) => it.imageIndex === Number(payload.imageIndex))
      if (!image) throw new Error(`Location image not found for imageIndex=${payload.imageIndex}`)
      locationImages = [image]
    } else {
      locationImages = requestedCount === null ? location.images : location.images.slice(0, requestedCount)
    }
  }

  const locationIds = Array.from(new Set(locationImages.map((it) => it.locationId)))

  for (let i = 0; i < locationImages.length; i++) {
    const item = locationImages[i]
    const promptBody = item.description || ''
    if (!promptBody) continue
    const promptCore = assetType === 'prop'
      ? buildPropImagePromptCore({
        description: promptBody,
      })
      : buildLocationImagePromptCore({
        description: promptBody,
        availableSlotsRaw: item.availableSlots,
        locale: job.data.locale === 'en' ? 'en' : 'zh',
      })

    const promptWithSuffix = assetType === 'prop'
      ? addPropPromptSuffix(promptCore)
      : addLocationPromptSuffix(promptCore)
    const prompt = artStyle ? `${promptWithSuffix}，${artStyle}` : promptWithSuffix
    const aspectRatio = assetType === 'prop' ? PROP_IMAGE_RATIO : LOCATION_IMAGE_RATIO
    await reportTaskProgress(job, 20 + Math.floor((i / Math.max(locationImages.length, 1)) * 55), {
      stage: 'generate_location_image',
      imageId: item.id,
    })

    const imageKey = await generateCleanImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      targetId: item.id,
      keyPrefix: 'location',
      options: {
        aspectRatio,
      },
    })

    await assertTaskActive(job, 'persist_location_image')
    await db.locationImage.update({
      where: { id: item.id },
      data: { imageUrl: imageKey },
    })
  }

  return {
    updated: locationImages.length,
    locationIds,
  }
}
