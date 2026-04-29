import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST - 确认选择并删除未选中的候选图片
 * Body: { characterId, appearanceId }
 * 
 * 工作流程：
 * 1. 验证已经选择了一张图片（selectedIndex 不为 null）
 * 2. 删除 imageUrls 中未选中的图片（从 COS 和数据库）
 * 3. 将选中的图片设为唯一图片
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
  const { characterId, appearanceId } = body

  if (!characterId || !appearanceId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'confirm_character_appearance_selection',
    projectId,
    userId: authResult.session.user.id,
    input: {
      characterId,
      appearanceId,
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
