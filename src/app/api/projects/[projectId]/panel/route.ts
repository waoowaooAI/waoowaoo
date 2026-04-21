import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/projects/[projectId]/panel
 * 新增一个 Panel
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const storyboardId = typeof body.storyboardId === 'string' ? body.storyboardId.trim() : ''
  if (!storyboardId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'create_storyboard_panel',
    projectId,
    userId: authResult.session.user.id,
    input: {
      storyboardId,
      ...body,
    },
    source: 'project-ui',
  })

  const panel = (result && typeof result === 'object' && !Array.isArray(result))
    ? (result as { panel?: unknown }).panel
    : undefined

  return NextResponse.json({ success: true, panel })
})

/**
 * DELETE /api/projects/[projectId]/panel
 * 删除一个 Panel
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const panelId = searchParams.get('panelId')

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'delete_storyboard_panel',
    projectId,
    userId: authResult.session.user.id,
    input: {
      panelId,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})

/**
 * PATCH /api/projects/[projectId]/panel
 * 更新单个 Panel 的属性（视频提示词等）
 * 支持两种更新方式：
 * 1. 通过 panelId 直接更新（推荐，用于清除错误等操作）
 * 2. 通过 storyboardId + panelIndex 更新（兼容旧接口）
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { panelId, storyboardId, panelIndex, videoPrompt, firstLastFramePrompt } = body

  // 🔥 方式1：通过 panelId 直接更新（优先）
  if (panelId) {
    await executeProjectAgentOperationFromApi({
      request,
      operationId: 'update_storyboard_panel_prompt',
      projectId,
      userId: authResult.session.user.id,
      input: {
        panelId,
        ...(videoPrompt !== undefined ? { videoPrompt } : {}),
        ...(firstLastFramePrompt !== undefined ? { firstLastFramePrompt } : {}),
      },
      source: 'project-ui',
    })

    return NextResponse.json({ success: true })
  }

  // 🔥 方式2：通过 storyboardId + panelIndex 更新（兼容旧接口）
  if (!storyboardId || panelIndex === undefined) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_storyboard_panel_prompt',
    projectId,
    userId: authResult.session.user.id,
    input: {
      storyboardId,
      panelIndex: Number(panelIndex),
      ...(videoPrompt !== undefined ? { videoPrompt } : {}),
      ...(firstLastFramePrompt !== undefined ? { firstLastFramePrompt } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})

/**
 * PUT /api/projects/[projectId]/panel
 * 完整更新单个 Panel 的所有属性（用于文字分镜编辑）
 */
export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const storyboardId = typeof body.storyboardId === 'string' ? body.storyboardId.trim() : ''
  if (!storyboardId) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_storyboard_panel_fields',
    projectId,
    userId: authResult.session.user.id,
    input: {
      storyboardId,
      ...body,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})
