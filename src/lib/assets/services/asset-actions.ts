import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import { ApiError, getRequestId } from '@/lib/api-errors'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, getUserModelConfig, buildImageBillingPayload, buildImageBillingPayloadFromUserConfig } from '@/lib/config-service'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { ensureGlobalLocationImageSlots, ensureProjectLocationImageSlots } from '@/lib/image-generation/location-slots'
import { hasCharacterAppearanceOutput, hasGlobalCharacterAppearanceOutput, hasGlobalCharacterOutput, hasGlobalLocationImageOutput, hasGlobalLocationOutput, hasLocationImageOutput } from '@/lib/task/has-output'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import { PRIMARY_APPEARANCE_INDEX, isArtStyleValue, removeLocationPromptSuffix, removePropPromptSuffix, type ArtStyleValue } from '@/lib/constants'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { deleteObject } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { createProjectCharacterLabeledCopies, createProjectLocationLabeledCopies } from '@/lib/image-label'
import type { AssetKind, AssetScope } from '@/lib/assets/contracts'
import {
  normalizeLocationAvailableSlots,
  stringifyLocationAvailableSlots,
} from '@/lib/location-available-slots'
import {
  createGlobalLocationBackedAsset,
  createProjectLocationBackedAsset,
  deleteGlobalLocationBackedAsset,
  deleteProjectLocationBackedAsset,
  type LocationBackedAssetKind,
} from '@/lib/assets/services/location-backed-assets'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'
import { confirmProjectLocationBackedSelection } from '@/lib/assets/services/project-location-backed-selection'

type AssetWriteAccess = {
  scope: AssetScope
  userId: string
  projectId?: string
}

type AssetActionTarget = {
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetId: string
}

type AssetGenerateInput = AssetActionTarget & {
  request: NextRequest
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetModifyInput = AssetActionTarget & {
  request: NextRequest
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetSelectInput = AssetActionTarget & {
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetRevertInput = AssetActionTarget & {
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetCopyInput = {
  kind: AssetKind
  targetId: string
  globalAssetId: string
  access: {
    userId: string
    projectId: string
  }
}

type AssetUpdateInput = {
  kind: AssetKind
  assetId: string
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetVariantUpdateInput = {
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetId: string
  variantId: string
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetCreateInput = {
  kind: Extract<AssetKind, 'location' | 'prop'>
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetRemoveInput = {
  kind: Extract<AssetKind, 'location' | 'prop'>
  assetId: string
  access: AssetWriteAccess
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveOptionalArtStyle(body: Record<string, unknown>): ArtStyleValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, 'artStyle')) {
    return undefined
  }
  const artStyle = normalizeString(body.artStyle)
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      message: 'artStyle must be a supported value',
    })
  }
  return artStyle
}

function normalizeLocationBackedKind(kind: AssetKind): 'character' | 'location' {
  return kind === 'character' ? 'character' : 'location'
}

function requireLocationBackedKind(kind: AssetKind): LocationBackedAssetKind {
  if (kind !== 'location' && kind !== 'prop') {
    throw new ApiError('INVALID_PARAMS')
  }
  return kind
}

export async function submitAssetGenerateTask(input: AssetGenerateInput) {
  return input.access.scope === 'global'
    ? submitGlobalAssetGenerateTask(input)
    : submitProjectAssetGenerateTask(input)
}

async function submitGlobalAssetGenerateTask(input: AssetGenerateInput) {
  const locale = resolveRequiredTaskLocale(input.request, input.body)
  const appearanceIndex = toNumber(input.body.appearanceIndex) ?? PRIMARY_APPEARANCE_INDEX
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  const count = normalizedKind === 'character'
    ? normalizeImageGenerationCount('character', input.body.count)
    : normalizeImageGenerationCount('location', input.body.count)
  const requestedArtStyle = resolveOptionalArtStyle(input.body)
  const artStyle = requestedArtStyle || await resolveStoredGlobalArtStyle({
    userId: input.access.userId,
    kind: input.kind,
    assetId: input.assetId,
    appearanceIndex,
  })

  if (normalizedKind === 'location' && toNumber(input.body.imageIndex) === null) {
    const location = await prisma.globalLocation.findFirst({
      where: { id: input.assetId, userId: input.access.userId },
      select: {
        name: true,
        summary: true,
        assetKind: true,
        images: {
          orderBy: { imageIndex: 'asc' },
          take: 1,
          select: { description: true },
        },
      },
    })
    if (!location) {
      throw new ApiError('NOT_FOUND')
    }
    await ensureGlobalLocationImageSlots({
      locationId: input.assetId,
      count,
      fallbackDescription: location.assetKind === 'prop'
        ? resolvePropVisualDescription({
          name: location.name,
          summary: location.summary,
          description: location.images[0]?.description ?? null,
        })
        : location.summary || location.name,
    })
  }

  const payloadBase: Record<string, unknown> = normalizedKind === 'character'
    ? { ...input.body, id: input.assetId, type: input.kind, appearanceIndex, artStyle, count }
    : { ...input.body, id: input.assetId, type: input.kind, artStyle, count }
  const targetType = normalizedKind === 'character' ? 'GlobalCharacter' : 'GlobalLocation'
  const hasOutputAtStart = normalizedKind === 'character'
    ? await hasGlobalCharacterOutput({
      characterId: input.assetId,
      appearanceIndex,
    })
    : await hasGlobalLocationOutput({
      locationId: input.assetId,
    })

  const userModelConfig = await getUserModelConfig(input.access.userId)
  const imageModel = input.kind === 'character'
    ? userModelConfig.characterModel
    : userModelConfig.locationModel

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = buildImageBillingPayloadFromUserConfig({
      userModelConfig,
      imageModel,
      basePayload: payloadBase,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }

  return submitTask({
    userId: input.access.userId,
    locale,
    requestId: getRequestId(input.request),
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_IMAGE,
    targetType,
    targetId: input.assetId,
    payload: withTaskUiPayload(billingPayload, { hasOutputAtStart }),
    dedupeKey: `${TASK_TYPE.ASSET_HUB_IMAGE}:${targetType}:${input.assetId}:${normalizedKind === 'character' ? appearanceIndex : 'na'}:${toNumber(input.body.imageIndex) === null ? count : `single:${toNumber(input.body.imageIndex)}`}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.ASSET_HUB_IMAGE, billingPayload),
  })
}

async function submitProjectAssetGenerateTask(input: AssetGenerateInput) {
  const projectId = requireProjectId(input.access)
  const locale = resolveRequiredTaskLocale(input.request, input.body)
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  const count = normalizedKind === 'character'
    ? normalizeImageGenerationCount('character', input.body.count)
    : normalizeImageGenerationCount('location', input.body.count)
  const artStyle = resolveOptionalArtStyle(input.body)
  const appearanceId = normalizeString(input.body.appearanceId)
  const imageIndex = toNumber(input.body.imageIndex)

  if (normalizedKind === 'location' && imageIndex === null) {
    const location = await prisma.projectLocation.findUnique({
      where: { id: input.assetId },
      select: {
        name: true,
        summary: true,
        assetKind: true,
        images: {
          orderBy: { imageIndex: 'asc' },
          take: 1,
          select: { description: true },
        },
      },
    })
    if (!location) {
      throw new ApiError('NOT_FOUND')
    }
    await ensureProjectLocationImageSlots({
      locationId: input.assetId,
      count,
      fallbackDescription: location.assetKind === 'prop'
        ? resolvePropVisualDescription({
          name: location.name,
          summary: location.summary,
          description: location.images[0]?.description ?? null,
        })
        : location.summary || location.name,
    })
  }

  const taskType = normalizedKind === 'character' ? TASK_TYPE.IMAGE_CHARACTER : TASK_TYPE.IMAGE_LOCATION
  const targetType = normalizedKind === 'character' ? 'CharacterAppearance' : 'LocationImage'
  const targetId = normalizedKind === 'character' ? (appearanceId || input.assetId) : input.assetId
  if (!targetId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const hasOutputAtStart = normalizedKind === 'character'
    ? await hasCharacterAppearanceOutput({
      appearanceId: targetId,
      characterId: input.assetId,
      appearanceIndex: toNumber(input.body.appearanceIndex),
    })
    : await hasLocationImageOutput({
      locationId: input.assetId,
      imageIndex,
    })

  const projectModelConfig = await getProjectModelConfig(projectId, input.access.userId)
  const imageModel = normalizedKind === 'character'
    ? projectModelConfig.characterModel
    : projectModelConfig.locationModel
  const payloadBase = artStyle
    ? { ...input.body, type: input.kind, id: input.assetId, artStyle, count }
    : { ...input.body, type: input.kind, id: input.assetId, count }

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: input.access.userId,
      imageModel,
      basePayload: payloadBase,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }

  return submitTask({
    userId: input.access.userId,
    locale,
    requestId: getRequestId(input.request),
    projectId,
    type: taskType,
    targetType,
    targetId,
    payload: withTaskUiPayload(billingPayload, { hasOutputAtStart }),
    dedupeKey: `${taskType}:${targetId}:${imageIndex === null ? count : `single:${imageIndex}`}`,
    billingInfo: buildDefaultTaskBillingInfo(taskType, billingPayload),
  })
}

async function resolveStoredGlobalArtStyle(input: {
  userId: string
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetId: string
  appearanceIndex: number
}): Promise<string> {
  if (input.kind === 'character') {
    const appearance = await prisma.globalCharacterAppearance.findFirst({
      where: {
        characterId: input.assetId,
        appearanceIndex: input.appearanceIndex,
        character: { userId: input.userId },
      },
      select: { artStyle: true },
    })
    if (!appearance) {
      throw new ApiError('NOT_FOUND')
    }
    const artStyle = normalizeString(appearance.artStyle)
    if (!isArtStyleValue(artStyle)) {
      throw new ApiError('INVALID_PARAMS', { code: 'MISSING_ART_STYLE', message: 'Character appearance artStyle is not configured' })
    }
    return artStyle
  }
  const location = await prisma.globalLocation.findFirst({
    where: { id: input.assetId, userId: input.userId },
    select: { artStyle: true },
  })
  if (!location) {
    throw new ApiError('NOT_FOUND')
  }
  const artStyle = normalizeString(location.artStyle)
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', { code: 'MISSING_ART_STYLE', message: 'Location artStyle is not configured' })
  }
  return artStyle
}

export async function submitAssetModifyTask(input: AssetModifyInput) {
  return input.access.scope === 'global'
    ? submitGlobalAssetModifyTask(input)
    : submitProjectAssetModifyTask(input)
}

async function submitGlobalAssetModifyTask(input: AssetModifyInput) {
  const locale = resolveRequiredTaskLocale(input.request, input.body)
  const modifyPrompt = normalizeString(input.body.modifyPrompt)
  if (!modifyPrompt) {
    throw new ApiError('INVALID_PARAMS')
  }
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  const appearanceIndex = toNumber(input.body.appearanceIndex) ?? PRIMARY_APPEARANCE_INDEX
  const imageIndex = toNumber(input.body.imageIndex) ?? 0
  const extraImageAudit = sanitizeImageInputsForTaskPayload(
    Array.isArray(input.body.extraImageUrls) ? input.body.extraImageUrls : [],
  )
  if (extraImageAudit.issues.some((issue) => issue.reason === 'relative_path_rejected')) {
    throw new ApiError('INVALID_PARAMS')
  }
  const targetType = normalizedKind === 'character' ? 'GlobalCharacterAppearance' : 'GlobalLocationImage'
  const targetId = normalizedKind === 'character'
    ? `${input.assetId}:${appearanceIndex}:${imageIndex}`
    : `${input.assetId}:${imageIndex}`
  const hasOutputAtStart = normalizedKind === 'character'
    ? await hasGlobalCharacterAppearanceOutput({
      targetId,
      characterId: input.assetId,
      appearanceIndex,
      imageIndex,
    })
    : await hasGlobalLocationImageOutput({
      targetId,
      locationId: input.assetId,
      imageIndex,
    })
  const payload = {
    ...input.body,
    id: input.assetId,
    type: input.kind,
    extraImageUrls: extraImageAudit.normalized,
    meta: {
      ...toObject(input.body.meta),
      outboundImageInputAudit: {
        extraImageUrls: extraImageAudit.issues,
      },
    },
  }
  const userModelConfig = await getUserModelConfig(input.access.userId)
  const imageModel = userModelConfig.editModel
  let billingPayload: Record<string, unknown>
  try {
    billingPayload = buildImageBillingPayloadFromUserConfig({
      userModelConfig,
      imageModel,
      basePayload: payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }
  return submitTask({
    userId: input.access.userId,
    locale,
    requestId: getRequestId(input.request),
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_MODIFY,
    targetType,
    targetId,
    payload: withTaskUiPayload(billingPayload, { intent: 'modify', hasOutputAtStart }),
    dedupeKey: `${TASK_TYPE.ASSET_HUB_MODIFY}:${targetId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.ASSET_HUB_MODIFY, billingPayload),
  })
}

async function submitProjectAssetModifyTask(input: AssetModifyInput) {
  const projectId = requireProjectId(input.access)
  const locale = resolveRequiredTaskLocale(input.request, input.body)
  const modifyPrompt = normalizeString(input.body.modifyPrompt)
  if (!modifyPrompt) {
    throw new ApiError('INVALID_PARAMS')
  }
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  const targetType = normalizedKind === 'character' ? 'CharacterAppearance' : 'LocationImage'
  const targetId = normalizedKind === 'character'
    ? normalizeString(input.body.appearanceId) || input.assetId
    : normalizeString(input.body.locationImageId) || input.assetId
  if (!targetId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const hasOutputAtStart = normalizedKind === 'character'
    ? await hasCharacterAppearanceOutput({
      appearanceId: normalizeString(input.body.appearanceId) || null,
      characterId: input.assetId,
      appearanceIndex: toNumber(input.body.appearanceIndex),
    })
    : await hasLocationImageOutput({
      imageId: normalizeString(input.body.locationImageId) || null,
      locationId: input.assetId,
      imageIndex: toNumber(input.body.imageIndex),
    })
  const extraImageAudit = sanitizeImageInputsForTaskPayload(
    Array.isArray(input.body.extraImageUrls) ? input.body.extraImageUrls : [],
  )
  if (extraImageAudit.issues.some((issue) => issue.reason === 'relative_path_rejected')) {
    throw new ApiError('INVALID_PARAMS')
  }
  const payload = {
    ...input.body,
    type: input.kind,
    characterId: normalizedKind === 'character' ? input.assetId : undefined,
    locationId: normalizedKind === 'location' ? input.assetId : undefined,
    extraImageUrls: extraImageAudit.normalized,
    meta: {
      ...toObject(input.body.meta),
      outboundImageInputAudit: {
        extraImageUrls: extraImageAudit.issues,
      },
    },
  }
  const projectModelConfig = await getProjectModelConfig(projectId, input.access.userId)
  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: input.access.userId,
      imageModel: projectModelConfig.editModel,
      basePayload: payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }
  return submitTask({
    userId: input.access.userId,
    locale,
    requestId: getRequestId(input.request),
    projectId,
    type: TASK_TYPE.MODIFY_ASSET_IMAGE,
    targetType,
    targetId,
    payload: withTaskUiPayload(billingPayload, { intent: 'modify', hasOutputAtStart }),
    dedupeKey: `modify_asset_image:${targetType}:${targetId}:${input.body.imageIndex ?? 'na'}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.MODIFY_ASSET_IMAGE, billingPayload),
  })
}

export async function selectAssetRender(input: AssetSelectInput) {
  return input.access.scope === 'global'
    ? selectGlobalAssetRender(input)
    : selectProjectAssetRender(input)
}

async function selectGlobalAssetRender(input: AssetSelectInput) {
  if (input.kind === 'character') {
    const appearanceIndex = toNumber(input.body.appearanceIndex) ?? PRIMARY_APPEARANCE_INDEX
    const imageIndex = toNumber(input.body.imageIndex)
    const confirm = input.body.confirm === true
    const appearance = await prisma.globalCharacterAppearance.findFirst({
      where: {
        characterId: input.assetId,
        appearanceIndex,
        character: { userId: input.access.userId },
      },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    if (confirm && appearance.selectedIndex !== null) {
      const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'globalCharacterAppearance.imageUrls')
      const selectedUrl = imageUrls[appearance.selectedIndex]
      if (!selectedUrl) throw new ApiError('NOT_FOUND')
      for (let index = 0; index < imageUrls.length; index += 1) {
        if (index !== appearance.selectedIndex && imageUrls[index]) {
          const key = await resolveStorageKeyFromMediaValue(imageUrls[index]!)
          if (key) {
            try { await deleteObject(key) } catch { }
          }
        }
      }
      let descriptions: string[] = []
      if (appearance.descriptions) {
        try { descriptions = JSON.parse(appearance.descriptions) as string[] } catch { descriptions = [] }
      }
      const selectedDescription = descriptions[appearance.selectedIndex] || appearance.description || ''
      await prisma.globalCharacterAppearance.update({
        where: { id: appearance.id },
        data: {
          imageUrl: selectedUrl,
          imageUrls: encodeImageUrls([selectedUrl]),
          selectedIndex: 0,
          description: selectedDescription,
          descriptions: JSON.stringify([selectedDescription]),
        },
      })
    } else {
      await prisma.globalCharacterAppearance.update({
        where: { id: appearance.id },
        data: { selectedIndex: imageIndex },
      })
    }
    return { success: true }
  }

  const imageIndex = toNumber(input.body.imageIndex)
  const confirm = input.body.confirm === true
  const location = await prisma.globalLocation.findFirst({
    where: { id: input.assetId, userId: input.access.userId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) throw new ApiError('NOT_FOUND')
  const images = location.images
  const selectedImg = images.find((image) => image.isSelected)
  const confirmIndex = imageIndex ?? selectedImg?.imageIndex
  if (confirm && confirmIndex !== null && confirmIndex !== undefined) {
    const targetImage = images.find((image) => image.imageIndex === confirmIndex)
    if (!targetImage) throw new ApiError('NOT_FOUND')
    const imagesToDelete = images.filter((image) => image.id !== targetImage.id)
    for (const image of imagesToDelete) {
      if (image.imageUrl) {
        const key = await resolveStorageKeyFromMediaValue(image.imageUrl)
        if (key) {
          try { await deleteObject(key) } catch { }
        }
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.globalLocationImage.deleteMany({
        where: { locationId: input.assetId, id: { not: targetImage.id } },
      })
      await tx.globalLocationImage.update({
        where: { id: targetImage.id },
        data: { imageIndex: 0, isSelected: true },
      })
    })
  } else {
    await prisma.globalLocationImage.updateMany({
      where: { locationId: input.assetId },
      data: { isSelected: false },
    })
    if (imageIndex !== null) {
      const targetImage = images.find((image) => image.imageIndex === imageIndex)
      if (targetImage) {
        await prisma.globalLocationImage.update({
          where: { id: targetImage.id },
          data: { isSelected: true },
        })
      }
    }
  }
  return { success: true }
}

async function selectProjectAssetRender(input: AssetSelectInput) {
  if (input.kind === 'character') {
    const appearanceId = normalizeString(input.body.appearanceId) || normalizeString(input.body.variantId)
    const selectedIndex = toNumber(input.body.selectedIndex ?? input.body.imageIndex)
    if (!appearanceId) throw new ApiError('INVALID_PARAMS')
    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
    if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= imageUrls.length || !imageUrls[selectedIndex])) {
      throw new ApiError('INVALID_PARAMS')
    }
    const selectedImageKey = selectedIndex !== null ? imageUrls[selectedIndex] : null
    await prisma.characterAppearance.update({
      where: { id: appearance.id },
      data: { selectedIndex, imageUrl: selectedImageKey },
    })
    return { success: true }
  }
  const confirm = input.body.confirm === true
  if (confirm) {
    return confirmProjectLocationBackedSelection(input.assetId)
  }
  const selectedIndex = toNumber(input.body.selectedIndex ?? input.body.imageIndex)
  const location = await prisma.projectLocation.findUnique({
    where: { id: input.assetId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) throw new ApiError('NOT_FOUND')

  if (selectedIndex !== null) {
    const targetImage = location.images.find((image) => image.imageIndex === selectedIndex)
    if (!targetImage || !targetImage.imageUrl) {
      throw new ApiError('INVALID_PARAMS')
    }
  }
  await prisma.locationImage.updateMany({
    where: { locationId: input.assetId },
    data: { isSelected: false },
  })
  if (selectedIndex !== null) {
    const updated = await prisma.locationImage.update({
      where: { locationId_imageIndex: { locationId: input.assetId, imageIndex: selectedIndex } },
      data: { isSelected: true },
    })
    await prisma.projectLocation.update({
      where: { id: input.assetId },
      data: { selectedImageId: updated.id },
    })
  } else {
    await prisma.projectLocation.update({
      where: { id: input.assetId },
      data: { selectedImageId: null },
    })
  }
  return { success: true }
}

export async function revertAssetRender(input: AssetRevertInput) {
  return input.access.scope === 'global'
    ? revertGlobalAssetRender(input)
    : revertProjectAssetRender(input)
}

async function revertGlobalAssetRender(input: AssetRevertInput) {
  if (input.kind === 'character') {
    const appearanceIndex = toNumber(input.body.appearanceIndex) ?? PRIMARY_APPEARANCE_INDEX
    const appearance = await prisma.globalCharacterAppearance.findFirst({
      where: {
        characterId: input.assetId,
        appearanceIndex,
        character: { userId: input.access.userId },
      },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const previousImageUrls = decodeImageUrlsFromDb(appearance.previousImageUrls, 'globalCharacterAppearance.previousImageUrls')
    if (!appearance.previousImageUrl && previousImageUrls.length === 0) throw new ApiError('INVALID_PARAMS')
    const restoredImageUrls = previousImageUrls.length > 0 ? previousImageUrls : (appearance.previousImageUrl ? [appearance.previousImageUrl] : [])
    await prisma.globalCharacterAppearance.update({
      where: { id: appearance.id },
      data: {
        imageUrl: appearance.previousImageUrl || restoredImageUrls[0] || null,
        imageUrls: encodeImageUrls(restoredImageUrls),
        previousImageUrl: null,
        previousImageUrls: encodeImageUrls([]),
        selectedIndex: null,
        description: appearance.previousDescription ?? appearance.description,
        descriptions: appearance.previousDescriptions ?? appearance.descriptions,
        previousDescription: null,
        previousDescriptions: null,
      },
    })
    return { success: true }
  }
  const location = await prisma.globalLocation.findFirst({
    where: { id: input.assetId, userId: input.access.userId },
    include: { images: true },
  })
  if (!location) throw new ApiError('NOT_FOUND')
  for (const image of location.images) {
    if (image.previousImageUrl) {
      await prisma.globalLocationImage.update({
        where: { id: image.id },
        data: {
          imageUrl: image.previousImageUrl,
          previousImageUrl: null,
          description: image.previousDescription ?? image.description,
          previousDescription: null,
        },
      })
    }
  }
  return { success: true }
}

async function revertProjectAssetRender(input: AssetRevertInput) {
  if (input.kind === 'character') {
    const appearanceId = normalizeString(input.body.appearanceId) || normalizeString(input.body.variantId)
    if (!appearanceId) throw new ApiError('INVALID_PARAMS')
    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: appearanceId },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const previousImageUrls = decodeImageUrlsFromDb(appearance.previousImageUrls, 'characterAppearance.previousImageUrls')
    if (!appearance.previousImageUrl && previousImageUrls.length === 0) throw new ApiError('INVALID_PARAMS')
    const currentImageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
    for (const imageUrl of currentImageUrls) {
      const storageKey = await resolveStorageKeyFromMediaValue(imageUrl)
      if (storageKey) {
        try { await deleteObject(storageKey) } catch { }
      }
    }
    const restoredImageUrls = previousImageUrls.length > 0 ? previousImageUrls : (appearance.previousImageUrl ? [appearance.previousImageUrl] : [])
    await prisma.characterAppearance.update({
      where: { id: appearance.id },
      data: {
        imageUrl: appearance.previousImageUrl || restoredImageUrls[0] || null,
        imageUrls: encodeImageUrls(restoredImageUrls),
        previousImageUrl: null,
        previousImageUrls: encodeImageUrls([]),
        selectedIndex: null,
        description: appearance.previousDescription ?? appearance.description,
        descriptions: appearance.previousDescriptions ?? appearance.descriptions,
        previousDescription: null,
        previousDescriptions: null,
      },
    })
    return { success: true }
  }
  const location = await prisma.projectLocation.findUnique({
    where: { id: input.assetId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) throw new ApiError('NOT_FOUND')
  for (const image of location.images) {
    if (image.previousImageUrl) {
      if (image.imageUrl) {
        const storageKey = await resolveStorageKeyFromMediaValue(image.imageUrl)
        if (storageKey) {
          try { await deleteObject(storageKey) } catch { }
        }
      }
      await prisma.locationImage.update({
        where: { id: image.id },
        data: {
          imageUrl: image.previousImageUrl,
          previousImageUrl: null,
          description: image.previousDescription ?? image.description,
          previousDescription: null,
        },
      })
    }
  }
  return { success: true }
}

export async function copyAssetFromGlobal(input: AssetCopyInput) {
  if (input.kind === 'character') {
    return copyCharacterFromGlobal(input)
  }
  if (input.kind === 'location' || input.kind === 'prop') {
    return copyLocationFromGlobal(input)
  }
  if (input.kind === 'voice') {
    return copyVoiceFromGlobal(input)
  }
  throw new ApiError('INVALID_PARAMS')
}

async function copyCharacterFromGlobal(input: AssetCopyInput) {
  const globalCharacter = await prisma.globalCharacter.findFirst({
    where: { id: input.globalAssetId, userId: input.access.userId },
    include: { appearances: true },
  })
  if (!globalCharacter) throw new ApiError('NOT_FOUND')
  const projectCharacter = await prisma.projectCharacter.findUnique({
    where: { id: input.targetId },
    include: { appearances: true },
  })
  if (!projectCharacter) throw new ApiError('NOT_FOUND')
  if (projectCharacter.appearances.length > 0) {
    await prisma.characterAppearance.deleteMany({ where: { characterId: input.targetId } })
  }
  const labeledCopies = await createProjectCharacterLabeledCopies(
    globalCharacter.appearances.map((appearance) => ({
      imageUrl: appearance.imageUrl,
      imageUrls: appearance.imageUrls || encodeImageUrls([]),
      changeReason: appearance.changeReason,
    })),
    projectCharacter.name,
  )
  for (let index = 0; index < globalCharacter.appearances.length; index += 1) {
    const appearance = globalCharacter.appearances[index]
    const labeledCopy = labeledCopies[index]
    const originalImageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'globalCharacterAppearance.imageUrls')
    await prisma.characterAppearance.create({
      data: {
        characterId: input.targetId,
        appearanceIndex: appearance.appearanceIndex,
        changeReason: appearance.changeReason,
        description: appearance.description,
        descriptions: appearance.descriptions,
        imageUrl: labeledCopy?.imageUrl || appearance.imageUrl,
        imageUrls: labeledCopy?.imageUrls || encodeImageUrls(originalImageUrls),
        previousImageUrls: encodeImageUrls([]),
        selectedIndex: appearance.selectedIndex,
      },
    })
  }
  const character = await prisma.projectCharacter.update({
    where: { id: input.targetId },
    data: {
      sourceGlobalCharacterId: input.globalAssetId,
      profileConfirmed: true,
      voiceId: globalCharacter.voiceId,
      voiceType: globalCharacter.voiceType,
      customVoiceUrl: globalCharacter.customVoiceUrl,
    },
    include: { appearances: true },
  })
  return { success: true, character }
}

async function copyLocationFromGlobal(input: AssetCopyInput) {
  const globalLocation = await prisma.globalLocation.findFirst({
    where: { id: input.globalAssetId, userId: input.access.userId },
    include: { images: true },
  })
  if (!globalLocation) throw new ApiError('NOT_FOUND')
  const projectLocation = await prisma.projectLocation.findUnique({
    where: { id: input.targetId },
    include: { images: true },
  })
  if (!projectLocation) throw new ApiError('NOT_FOUND')
  if (projectLocation.images.length > 0) {
    await prisma.locationImage.deleteMany({ where: { locationId: input.targetId } })
  }
  const labeledCopies = await createProjectLocationLabeledCopies(
    globalLocation.images.map((image) => ({ imageUrl: image.imageUrl })),
    projectLocation.name,
  )
  const copiedImages: Array<{ id: string; imageIndex: number; imageUrl: string | null }> = []
  for (let index = 0; index < globalLocation.images.length; index += 1) {
    const image = globalLocation.images[index]
    const labeledCopy = labeledCopies[index]
    const created = await prisma.locationImage.create({
      data: {
        locationId: input.targetId,
        imageIndex: image.imageIndex,
        description: image.description,
        availableSlots: image.availableSlots,
        imageUrl: labeledCopy?.imageUrl || image.imageUrl,
        isSelected: image.isSelected,
      },
    })
    copiedImages.push(created)
  }
  const selectedFromGlobal = globalLocation.images.find((image) => image.isSelected)
  const selectedImageId = selectedFromGlobal
    ? copiedImages.find((image) => image.imageIndex === selectedFromGlobal.imageIndex)?.id
    : copiedImages.find((image) => image.imageUrl)?.id || null
  const location = await prisma.projectLocation.update({
    where: { id: input.targetId },
    data: {
      sourceGlobalLocationId: input.globalAssetId,
      summary: globalLocation.summary,
      selectedImageId,
    },
    include: { images: true },
  })
  return { success: true, location }
}

async function copyVoiceFromGlobal(input: AssetCopyInput) {
  const globalVoice = await prisma.globalVoice.findFirst({
    where: { id: input.globalAssetId, userId: input.access.userId },
  })
  if (!globalVoice) throw new ApiError('NOT_FOUND')
  const character = await prisma.projectCharacter.update({
    where: { id: input.targetId },
    data: {
      voiceId: globalVoice.voiceId,
      voiceType: globalVoice.voiceType,
      customVoiceUrl: globalVoice.customVoiceUrl,
    },
  })
  return { success: true, character }
}

export async function updateAsset(input: AssetUpdateInput) {
  if (input.access.scope === 'global') {
    return updateGlobalAsset(input)
  }
  return updateProjectAsset(input)
}

async function updateGlobalAsset(input: AssetUpdateInput) {
  if (input.kind === 'character') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.aliases !== undefined) updateData.aliases = input.body.aliases
    if (input.body.profileData !== undefined) updateData.profileData = input.body.profileData
    if (input.body.profileConfirmed !== undefined) updateData.profileConfirmed = input.body.profileConfirmed
    if (input.body.voiceId !== undefined) updateData.voiceId = input.body.voiceId
    if (input.body.voiceType !== undefined) updateData.voiceType = input.body.voiceType
    if (input.body.customVoiceUrl !== undefined) updateData.customVoiceUrl = input.body.customVoiceUrl
    if (input.body.globalVoiceId !== undefined) updateData.globalVoiceId = input.body.globalVoiceId
    if (input.body.folderId !== undefined) updateData.folderId = normalizeString(input.body.folderId) || null
    const character = await prisma.globalCharacter.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, character }
  }
  if (input.kind === 'location') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.summary !== undefined) updateData.summary = normalizeString(input.body.summary) || null
    if (input.body.folderId !== undefined) updateData.folderId = normalizeString(input.body.folderId) || null
    const location = await prisma.globalLocation.update({
      where: { id: input.assetId },
      data: updateData,
    })
    if (input.body.availableSlots !== undefined) {
      await prisma.globalLocationImage.updateMany({
        where: { locationId: input.assetId },
        data: {
          availableSlots: stringifyLocationAvailableSlots(
            normalizeLocationAvailableSlots(input.body.availableSlots),
          ),
        },
      })
    }
    return { success: true, location }
  }
  if (input.kind === 'prop') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.summary !== undefined) updateData.summary = normalizeString(input.body.summary) || null
    if (input.body.folderId !== undefined) updateData.folderId = normalizeString(input.body.folderId) || null
    const prop = await prisma.globalLocation.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, prop }
  }
  const updateData: Record<string, unknown> = {}
  if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
  if (input.body.description !== undefined) updateData.description = normalizeString(input.body.description) || null
  if (input.body.voiceId !== undefined) updateData.voiceId = input.body.voiceId
  if (input.body.voiceType !== undefined) updateData.voiceType = input.body.voiceType
  if (input.body.customVoiceUrl !== undefined) updateData.customVoiceUrl = input.body.customVoiceUrl
  if (input.body.voicePrompt !== undefined) updateData.voicePrompt = input.body.voicePrompt
  if (input.body.gender !== undefined) updateData.gender = input.body.gender
  if (input.body.language !== undefined) updateData.language = input.body.language
  if (input.body.folderId !== undefined) updateData.folderId = normalizeString(input.body.folderId) || null
  const voice = await prisma.globalVoice.update({
    where: { id: input.assetId },
    data: updateData,
  })
  return { success: true, voice }
}

async function updateProjectAsset(input: AssetUpdateInput) {
  if (input.kind === 'character') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.introduction !== undefined) updateData.introduction = normalizeString(input.body.introduction)
    if (input.body.voiceId !== undefined) updateData.voiceId = input.body.voiceId
    if (input.body.voiceType !== undefined) updateData.voiceType = input.body.voiceType
    if (input.body.customVoiceUrl !== undefined) updateData.customVoiceUrl = input.body.customVoiceUrl
    if (input.body.profileConfirmed !== undefined) updateData.profileConfirmed = input.body.profileConfirmed
    const character = await prisma.projectCharacter.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, character }
  }
  if (input.kind === 'location') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.summary !== undefined) updateData.summary = normalizeString(input.body.summary) || null
    const location = await prisma.projectLocation.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, location }
  }
  if (input.kind === 'prop') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.summary !== undefined) updateData.summary = normalizeString(input.body.summary) || null
    const prop = await prisma.projectLocation.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, prop }
  }
  throw new ApiError('INVALID_PARAMS')
}

export async function updateAssetVariant(input: AssetVariantUpdateInput) {
  if (input.access.scope === 'global') {
    return updateGlobalAssetVariant(input)
  }
  return updateProjectAssetVariant(input)
}

async function updateGlobalAssetVariant(input: AssetVariantUpdateInput) {
  if (input.kind === 'character') {
    const appearance = await prisma.globalCharacterAppearance.findUnique({
      where: { id: input.variantId },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const updateData: Record<string, unknown> = {}
    if (input.body.description !== undefined) {
      const trimmedDescription = normalizeString(input.body.description)
      let descriptions: string[] = []
      if (appearance.descriptions) {
        try { descriptions = JSON.parse(appearance.descriptions) as string[] } catch { descriptions = [] }
      }
      if (descriptions.length === 0) descriptions = [appearance.description || '']
      const descriptionIndex = toNumber(input.body.descriptionIndex)
      if (descriptionIndex !== null) descriptions[descriptionIndex] = trimmedDescription
      else descriptions[0] = trimmedDescription
      updateData.descriptions = JSON.stringify(descriptions)
      updateData.description = descriptions[0]
    }
    if (input.body.changeReason !== undefined) updateData.changeReason = normalizeString(input.body.changeReason)
    if (input.body.artStyle !== undefined) {
      const artStyle = normalizeString(input.body.artStyle)
      if (!isArtStyleValue(artStyle)) {
        throw new ApiError('INVALID_PARAMS', { code: 'INVALID_ART_STYLE', message: 'artStyle must be a supported value' })
      }
      updateData.artStyle = artStyle
    }
    await prisma.globalCharacterAppearance.update({
      where: { id: input.variantId },
      data: updateData,
    })
    return { success: true }
  }
  if (input.kind === 'prop') {
    const trimmedDescription = normalizeString(input.body.description)
    if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
    const cleanDescription = removePropPromptSuffix(trimmedDescription)
    const image = await prisma.globalLocationImage.update({
      where: { id: input.variantId },
      data: { description: cleanDescription },
    })
    return { success: true, image }
  }
  throw new ApiError('INVALID_PARAMS')
}

async function updateProjectAssetVariant(input: AssetVariantUpdateInput) {
  if (input.kind === 'character') {
    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: input.variantId },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const trimmedDescription = normalizeString(input.body.description)
    if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
    let descriptions: string[] = []
    try {
      descriptions = appearance.descriptions ? JSON.parse(appearance.descriptions) as string[] : []
    } catch {
      descriptions = []
    }
    const descriptionIndex = toNumber(input.body.descriptionIndex) ?? 0
    if (descriptionIndex >= 0 && descriptionIndex < descriptions.length) descriptions[descriptionIndex] = trimmedDescription
    else descriptions.push(trimmedDescription)
    await prisma.characterAppearance.update({
      where: { id: input.variantId },
      data: {
        description: trimmedDescription,
        descriptions: JSON.stringify(descriptions),
      },
    })
    return { success: true }
  }
  if (input.kind === 'prop') {
    const trimmedDescription = normalizeString(input.body.description)
    if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
    const cleanDescription = removePropPromptSuffix(trimmedDescription)
    const image = await prisma.locationImage.update({
      where: { id: input.variantId },
      data: { description: cleanDescription },
    })
    return { success: true, image }
  }
  const trimmedDescription = normalizeString(input.body.description)
  if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
  const cleanDescription = removeLocationPromptSuffix(trimmedDescription)
  const image = await prisma.locationImage.update({
    where: { id: input.variantId },
    data: { description: cleanDescription },
  })
  return { success: true, image }
}

export async function createAsset(input: AssetCreateInput) {
  const name = normalizeString(input.body.name)
  const kind = requireLocationBackedKind(input.kind)
  const summary = normalizeString(input.body.summary || input.body.description)
  const description = kind === 'prop'
    ? normalizeString(input.body.description)
    : summary
  if (!name || !summary || !description) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (input.access.scope === 'global') {
    const created = await createGlobalLocationBackedAsset({
      userId: input.access.userId,
      folderId: normalizeString(input.body.folderId) || null,
      name,
      summary,
      initialDescription: description,
      artStyle: normalizeString(input.body.artStyle) || null,
      kind,
    })
    return { success: true, assetId: created.id }
  }

  const created = await createProjectLocationBackedAsset({
    projectId: requireProjectId(input.access),
    name,
    summary,
    initialDescription: description,
    kind,
  })
  return { success: true, assetId: created.id }
}

export async function removeAsset(input: AssetRemoveInput) {
  requireLocationBackedKind(input.kind)
  if (input.access.scope === 'global') {
    await deleteGlobalLocationBackedAsset(input.assetId)
    return { success: true }
  }
  requireProjectId(input.access)
  await deleteProjectLocationBackedAsset(input.assetId)
  return { success: true }
}

function requireProjectId(access: AssetWriteAccess): string {
  if (!access.projectId) {
    throw new ApiError('INVALID_PARAMS', { details: 'projectId is required' })
  }
  return access.projectId
}
