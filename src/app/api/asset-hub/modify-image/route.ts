import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getUserModelConfig, buildImageBillingPayloadFromUserConfig } from '@/lib/config-service'
import {
  hasGlobalCharacterAppearanceOutput,
  hasGlobalLocationImageOutput
} from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const locale = resolveRequiredTaskLocale(request, body)
  const type = body?.type
  const modifyPrompt = body?.modifyPrompt
  const id = body?.id
  const appearanceIndex = body?.appearanceIndex
  const imageIndex = body?.imageIndex

  if (!type || !modifyPrompt || !id) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (type !== 'character' && type !== 'location') {
    throw new ApiError('INVALID_PARAMS')
  }

  const extraImageAudit = sanitizeImageInputsForTaskPayload(
    Array.isArray(body?.extraImageUrls) ? body.extraImageUrls : [],
  )
  const rejectedRelativePathCount = extraImageAudit.issues.filter(
    (issue) => issue.reason === 'relative_path_rejected',
  ).length
  if (rejectedRelativePathCount > 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const targetType = type === 'character' ? 'GlobalCharacterAppearance' : 'GlobalLocationImage'
  const targetId = type === 'character'
    ? `${id}:${appearanceIndex ?? PRIMARY_APPEARANCE_INDEX}:${imageIndex ?? 0}`
    : `${id}:${imageIndex ?? 0}`
  const hasOutputAtStart = type === 'character'
    ? await hasGlobalCharacterAppearanceOutput({
      targetId,
      characterId: id,
      appearanceIndex: toNumber(appearanceIndex),
      imageIndex: toNumber(imageIndex)
    })
    : await hasGlobalLocationImageOutput({
      targetId,
      locationId: id,
      imageIndex: toNumber(imageIndex)
    })

  const payload = {
    ...body,
    extraImageUrls: extraImageAudit.normalized,
    meta: {
      ...toObject(body?.meta),
      outboundImageInputAudit: {
        extraImageUrls: extraImageAudit.issues
      }
    }
  }

  const userModelConfig = await getUserModelConfig(session.user.id)
  const imageModel = userModelConfig.editModel

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = buildImageBillingPayloadFromUserConfig({
      userModelConfig,
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
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_MODIFY,
    targetType,
    targetId,
    payload: withTaskUiPayload(billingPayload, {
      intent: 'modify',
      hasOutputAtStart
    }),
    dedupeKey: `${TASK_TYPE.ASSET_HUB_MODIFY}:${targetId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.ASSET_HUB_MODIFY, billingPayload)
  })

  return NextResponse.json(result)
})
