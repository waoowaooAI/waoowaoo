import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/projects/[projectId]/storyboard-group
 * 添加一组新的分镜（创建 Clip + Storyboard + 初始 Panel）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { episodeId, insertIndex } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'create_storyboard_group',
    projectId,
    userId: authResult.session.user.id,
    input: {
      episodeId,
      ...(insertIndex !== undefined ? { insertIndex } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})

/**
 * PUT /api/projects/[projectId]/storyboard-group
 * 调整分镜组顺序（通过修改 clip 的 createdAt）
 */
export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { episodeId, clipId, direction } = body // direction: 'up' | 'down'

  if (!episodeId || !clipId || !direction) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'move_storyboard_group',
    projectId,
    userId: authResult.session.user.id,
    input: {
      episodeId,
      clipId,
      direction,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})

/**
 * DELETE /api/projects/[projectId]/storyboard-group
 * 删除整个分镜组（Clip + Storyboard + 所有 Panels）
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
  const storyboardId = searchParams.get('storyboardId')

  if (!storyboardId) {
    throw new ApiError('INVALID_PARAMS')
  }

  try {
    await executeProjectAgentOperationFromApi({
      request,
      operationId: 'delete_storyboard_group',
      projectId,
      userId: authResult.session.user.id,
      input: {
        storyboardId,
      },
      source: 'project-ui',
    })
  } catch (error) {
    // Make DELETE idempotent: deleting a missing storyboard group is a no-op.
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return NextResponse.json({ success: true, skipped: true })
    }
    throw error
  }

  return NextResponse.json({ success: true })
})
