import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import { isArtStyleValue, type ArtStyleValue } from '@/lib/constants'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const rawBody = await request.json().catch(() => ({}))
  const body = toObject(rawBody)
  const taskLocale = resolveTaskLocale(request, body)
  const bodyMeta = toObject(body.meta)
  const characterId = normalizeString(body.characterId)
  const appearanceId = normalizeString(body.appearanceId)
  const count = normalizeImageGenerationCount('character', body.count)

  let artStyle: ArtStyleValue | undefined
  if (Object.prototype.hasOwnProperty.call(body, 'artStyle')) {
    const parsedArtStyle = normalizeString(body.artStyle)
    if (!isArtStyleValue(parsedArtStyle)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'INVALID_ART_STYLE',
        message: 'artStyle must be a supported value',
      })
    }
    artStyle = parsedArtStyle
  }

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  let targetAppearanceId = appearanceId
  if (!targetAppearanceId) {
    const character = await prisma.projectCharacter.findUnique({
      where: { id: characterId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    if (!character) {
      throw new ApiError('NOT_FOUND')
    }
    const firstAppearance = character.appearances[0]
    if (!firstAppearance) {
      throw new ApiError('NOT_FOUND')
    }
    targetAppearanceId = firstAppearance.id
  }

  const result = await submitAssetGenerateTask({
    request,
    kind: 'character',
    assetId: characterId,
    body: {
      appearanceId: targetAppearanceId,
      count,
      artStyle,
      locale: taskLocale || undefined,
      meta: {
        ...bodyMeta,
        locale: taskLocale || bodyMeta.locale || undefined,
      },
    },
    access: {
      scope: 'project',
      userId: authResult.session.user.id,
      projectId,
    },
  })

  return NextResponse.json(result)
})
