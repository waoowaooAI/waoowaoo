import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getUserModelConfig, buildImageBillingPayloadFromUserConfig } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import {
  hasGlobalCharacterOutput,
  hasGlobalLocationOutput
} from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { PRIMARY_APPEARANCE_INDEX, isArtStyleValue } from '@/lib/constants'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { ensureGlobalLocationImageSlots } from '@/lib/image-generation/location-slots'

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveRequestedArtStyle(body: Record<string, unknown>): string | null {
  if (!Object.prototype.hasOwnProperty.call(body, 'artStyle')) return null
  const artStyle = normalizeString(body.artStyle)
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      message: 'artStyle must be a supported value',
    })
  }
  return artStyle
}

async function resolveStoredArtStyle(input: {
  userId: string
  type: 'character' | 'location'
  id: string
  appearanceIndex: number
}): Promise<string> {
  if (input.type === 'character') {
    const appearance = await prisma.globalCharacterAppearance.findFirst({
      where: {
        characterId: input.id,
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
      throw new ApiError('INVALID_PARAMS', {
        code: 'MISSING_ART_STYLE',
        message: 'Character appearance artStyle is not configured',
      })
    }
    return artStyle
  }

  const location = await prisma.globalLocation.findFirst({
    where: {
      id: input.id,
      userId: input.userId,
    },
    select: { artStyle: true },
  })
  if (!location) {
    throw new ApiError('NOT_FOUND')
  }
  const artStyle = normalizeString(location.artStyle)
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MISSING_ART_STYLE',
      message: 'Location artStyle is not configured',
    })
  }
  return artStyle
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const rawBody = await request.json().catch(() => ({}))
  const body = toObject(rawBody)
  const locale = resolveRequiredTaskLocale(request, body)
  const type = normalizeString(body.type)
  const id = normalizeString(body.id)
  if (!type || !id) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (type !== 'character' && type !== 'location') {
    throw new ApiError('INVALID_PARAMS')
  }
  const appearanceIndex = toNumber(body.appearanceIndex)
  const resolvedAppearanceIndex = appearanceIndex ?? PRIMARY_APPEARANCE_INDEX
  const count = type === 'character'
    ? normalizeImageGenerationCount('character', body.count)
    : normalizeImageGenerationCount('location', body.count)
  const requestedArtStyle = resolveRequestedArtStyle(body)
  const artStyle = requestedArtStyle || await resolveStoredArtStyle({
    userId: session.user.id,
    type,
    id,
    appearanceIndex: resolvedAppearanceIndex,
  })
  if (type === 'location' && toNumber(body.imageIndex) === null) {
    const location = await prisma.globalLocation.findFirst({
      where: { id, userId: session.user.id },
      select: { name: true, summary: true },
    })
    if (!location) {
      throw new ApiError('NOT_FOUND')
    }
    await ensureGlobalLocationImageSlots({
      locationId: id,
      count,
      fallbackDescription: location.summary || location.name,
    })
  }
  const payloadBase: Record<string, unknown> = type === 'character'
    ? { ...body, id, type, appearanceIndex: resolvedAppearanceIndex, artStyle, count }
    : { ...body, id, type, artStyle, count }

  const targetType = type === 'character' ? 'GlobalCharacter' : 'GlobalLocation'
  const hasOutputAtStart = type === 'character'
    ? await hasGlobalCharacterOutput({
      characterId: id,
      appearanceIndex: resolvedAppearanceIndex
    })
    : await hasGlobalLocationOutput({
      locationId: id
    })
  const userModelConfig = await getUserModelConfig(session.user.id)
  const imageModel = type === 'character'
    ? userModelConfig.characterModel
    : userModelConfig.locationModel

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = buildImageBillingPayloadFromUserConfig({
      userModelConfig,
      imageModel,
      basePayload: payloadBase,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_IMAGE,
    targetType,
    targetId: id,
    payload: withTaskUiPayload(billingPayload, { hasOutputAtStart }),
    dedupeKey: `${TASK_TYPE.ASSET_HUB_IMAGE}:${targetType}:${id}:${type === 'character' ? resolvedAppearanceIndex : 'na'}:${toNumber(body.imageIndex) === null ? count : `single:${toNumber(body.imageIndex)}`}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.ASSET_HUB_IMAGE, billingPayload)
  })

  return NextResponse.json(result)
})
