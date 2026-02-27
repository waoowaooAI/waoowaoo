import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, buildImageBillingPayload } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'

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
  const storyboardId = body?.storyboardId
  const insertAfterPanelId = body?.insertAfterPanelId
  const sourcePanelId = body?.sourcePanelId
  const variant = body?.variant

  if (!storyboardId || !insertAfterPanelId || !sourcePanelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (!variant || !variant.video_prompt) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 在 API route 中同步创建 panel（无图片），确保新 panel 立即存在于数据库，
  // 避免乐观更新与 worker 之间的状态真空期
  const sourcePanel = await prisma.novelPromotionPanel.findUnique({ where: { id: sourcePanelId } })
  if (!sourcePanel) {
    throw new ApiError('NOT_FOUND')
  }

  const insertAfter = await prisma.novelPromotionPanel.findUnique({ where: { id: insertAfterPanelId } })
  if (!insertAfter) {
    throw new ApiError('NOT_FOUND')
  }

  const createdPanel = await prisma.$transaction(async (tx) => {
    // Two-phase reindexing to avoid unique constraint collision on (storyboardId, panelIndex)
    const affectedPanels = await tx.novelPromotionPanel.findMany({
      where: { storyboardId, panelIndex: { gt: insertAfter.panelIndex } },
      select: { id: true, panelIndex: true },
      orderBy: { panelIndex: 'asc' }
    })
    // Phase A: shift to negative indices
    for (const p of affectedPanels) {
      await tx.novelPromotionPanel.update({
        where: { id: p.id },
        data: { panelIndex: -(p.panelIndex + 1) }
      })
    }
    // Phase B: set final positive indices
    for (const p of affectedPanels) {
      await tx.novelPromotionPanel.update({
        where: { id: p.id },
        data: { panelIndex: p.panelIndex + 1 }
      })
    }

    return tx.novelPromotionPanel.create({
      data: {
        storyboardId,
        panelIndex: insertAfter.panelIndex + 1,
        panelNumber: insertAfter.panelIndex + 2,
        shotType: variant.shot_type || sourcePanel.shotType,
        cameraMove: variant.camera_move || sourcePanel.cameraMove,
        description: variant.description || sourcePanel.description,
        videoPrompt: variant.video_prompt || sourcePanel.videoPrompt,
        location: variant.location || sourcePanel.location,
        characters: variant.characters ? JSON.stringify(variant.characters) : sourcePanel.characters,
        srtSegment: sourcePanel.srtSegment,
        duration: sourcePanel.duration
      }
    })
  })

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  const imageModel = projectModelConfig.storyboardModel

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: session.user.id,
      imageModel,
      basePayload: { ...body, newPanelId: createdPanel.id },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }
  // Task target 指向新创建的 panel，使 task state 监控系统正确追踪
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.PANEL_VARIANT,
    targetType: 'NovelPromotionPanel',
    targetId: createdPanel.id,
    payload: billingPayload,
    dedupeKey: `panel_variant:${storyboardId}:${insertAfterPanelId}:${sourcePanelId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.PANEL_VARIANT, billingPayload)
  })

  return NextResponse.json({ ...result, panelId: createdPanel.id })
})
