import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { hasPanelImageOutput } from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { getProjectModelConfig, buildImageBillingPayload } from '@/lib/config-service'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'

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
  const storyboardId = typeof body?.storyboardId === 'string' ? body.storyboardId : ''
  const panelIndex = Number(body?.panelIndex)
  const modifyPrompt = typeof body?.modifyPrompt === 'string' ? body.modifyPrompt.trim() : ''

  if (!storyboardId || !Number.isFinite(panelIndex) || !modifyPrompt) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId,
      panelIndex
    },
    select: {
      id: true
    }
  })
  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  const extraImageAudit = sanitizeImageInputsForTaskPayload(
    Array.isArray(body?.extraImageUrls) ? body.extraImageUrls : [],
  )
  const selectedAssetsRaw = Array.isArray(body?.selectedAssets) ? body.selectedAssets : []
  const selectedAssetIssues: Array<Record<string, unknown>> = []
  const normalizedSelectedAssets = selectedAssetsRaw.map((asset: unknown, assetIndex: number) => {
    if (!asset || typeof asset !== 'object') return asset
    const imageUrl = (asset as Record<string, unknown>).imageUrl
    const audit = sanitizeImageInputsForTaskPayload([imageUrl])
    for (const issue of audit.issues) {
      selectedAssetIssues.push({
        assetIndex,
        ...issue
      })
    }
    const normalizedUrl = audit.normalized[0]
    if (!normalizedUrl) return asset
    return {
      ...toObject(asset),
      imageUrl: normalizedUrl
    }
  })

  const rejectedRelativePathCount = [
    ...extraImageAudit.issues,
    ...selectedAssetIssues,
  ].filter((issue) => issue.reason === 'relative_path_rejected').length
  if (rejectedRelativePathCount > 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const payload = {
    ...body,
    type: 'storyboard',
    panelId: panel.id,
    panelIndex,
    extraImageUrls: extraImageAudit.normalized,
    selectedAssets: normalizedSelectedAssets,
    meta: {
      ...toObject(body?.meta),
      outboundImageInputAudit: {
        extraImageUrls: extraImageAudit.issues,
        selectedAssets: selectedAssetIssues
      }
    }
  }
  const hasOutputAtStart = await hasPanelImageOutput(panel.id)

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
    targetType: 'NovelPromotionPanel',
    targetId: panel.id,
    payload: withTaskUiPayload(billingPayload, {
      intent: 'modify',
      hasOutputAtStart
    }),
    dedupeKey: `modify_storyboard_image:${panel.id}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.MODIFY_ASSET_IMAGE, billingPayload)
  })

  return NextResponse.json(result)
})
