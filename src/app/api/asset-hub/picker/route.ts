import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * GET /api/asset-hub/picker
 * 获取用户的全局资产列表，用于在项目中选择要复制的资产
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'character'

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'asset_hub_picker',
    projectId: 'global-asset-hub',
    userId: session.user.id,
    input: { type },
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

