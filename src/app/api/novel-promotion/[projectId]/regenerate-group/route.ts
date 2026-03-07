import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { getProjectModelConfig, buildImageBillingPayload } from '@/lib/config-service'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { ensureProjectLocationImageSlots } from '@/lib/image-generation/location-slots'
import { prisma } from '@/lib/prisma'
import {
  hasCharacterAppearanceOutput,
  hasLocationImageOutput
} from '@/lib/task/has-output'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const locale = resolveRequiredTaskLocale(request, body)
  const type = body?.type
  const id = body?.id
  const appearanceId = body?.appearanceId
  const count = type === 'character'
    ? normalizeImageGenerationCount('character', body?.count)
    : normalizeImageGenerationCount('location', body?.count)

  if (!type || !id) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (type !== 'character' && type !== 'location') {
    throw new ApiError('INVALID_PARAMS')
  }

  if (type === 'character' && !appearanceId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const targetType = type === 'character' ? 'CharacterAppearance' : 'LocationImage'
  const targetId = type === 'character' ? appearanceId : id
  if (type === 'location') {
    const location = await prisma.novelPromotionLocation.findUnique({
      where: { id },
      select: { name: true, summary: true },
    })
    if (!location) {
      throw new ApiError('NOT_FOUND')
    }
    await ensureProjectLocationImageSlots({
      locationId: id,
      count,
      fallbackDescription: location.summary || location.name,
    })
  }
  const hasOutputAtStart = type === 'character'
    ? await hasCharacterAppearanceOutput({
      appearanceId,
      characterId: id
    })
    : await hasLocationImageOutput({
      locationId: id
    })

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  const imageModel = type === 'character'
    ? projectModelConfig.characterModel
    : projectModelConfig.locationModel

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: session.user.id,
      imageModel,
      basePayload: { ...body, count },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.REGENERATE_GROUP,
    targetType,
    targetId,
    payload: withTaskUiPayload(billingPayload, {
      intent: 'regenerate',
      hasOutputAtStart
    }),
    dedupeKey: `regenerate_group:${targetType}:${targetId}:${count}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.REGENERATE_GROUP, billingPayload)
  })

  return NextResponse.json(result)
})
