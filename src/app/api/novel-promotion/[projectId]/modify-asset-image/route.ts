import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { getProjectModelConfig, buildImageBillingPayload } from '@/lib/config-service'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import {
  hasCharacterAppearanceOutput,
  hasLocationImageOutput
} from '@/lib/task/has-output'

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

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
  const modifyPrompt = body?.modifyPrompt

  if (!type || !modifyPrompt) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (type !== 'character' && type !== 'location') {
    throw new ApiError('INVALID_PARAMS')
  }

  const targetType = type === 'character' ? 'CharacterAppearance' : 'LocationImage'
  const targetId = type === 'character'
    ? (body?.appearanceId || body?.characterId)
    : (body?.locationImageId || body?.locationId)

  if (!targetId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const hasOutputAtStart = type === 'character'
    ? await hasCharacterAppearanceOutput({
      appearanceId: body?.appearanceId || null,
      characterId: body?.characterId || null,
      appearanceIndex: toNumber(body?.appearanceIndex)
    })
    : await hasLocationImageOutput({
      imageId: body?.locationImageId || null,
      locationId: body?.locationId || null,
      imageIndex: toNumber(body?.imageIndex)
    })

  const extraImageAudit = sanitizeImageInputsForTaskPayload(
    Array.isArray(body?.extraImageUrls) ? body.extraImageUrls : [],
  )
  const rejectedRelativePathCount = extraImageAudit.issues.filter(
    (issue) => issue.reason === 'relative_path_rejected',
  ).length
  if (rejectedRelativePathCount > 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const baseMeta = toObject(body?.meta)
  const payload = {
    ...body,
    extraImageUrls: extraImageAudit.normalized,
    meta: {
      ...baseMeta,
      outboundImageInputAudit: {
        extraImageUrls: extraImageAudit.issues
      }
    }
  }

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  const imageModel = projectModelConfig.editModel

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: session.user.id,
      imageModel,
      basePayload: payload,
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
    type: TASK_TYPE.MODIFY_ASSET_IMAGE,
    targetType,
    targetId,
    payload: withTaskUiPayload(billingPayload, {
      intent: 'modify',
      hasOutputAtStart
    }),
    dedupeKey: `modify_asset_image:${targetType}:${targetId}:${body?.imageIndex ?? 'na'}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.MODIFY_ASSET_IMAGE, billingPayload)
  })

  return NextResponse.json(result)
})
