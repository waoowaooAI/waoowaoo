import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import { getUserModelConfig } from '@/lib/config-service'

/**
 * 资产中心 - AI 设计场景描述（任务化）
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const userInstruction = typeof body.userInstruction === 'string' ? body.userInstruction.trim() : ''
  if (!userInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }

  const userConfig = await getUserModelConfig(session.user.id)
  if (!userConfig.analysisModel) {
    throw new ApiError('MISSING_CONFIG')
  }

  const dedupeDigest = createHash('sha1')
    .update(`${session.user.id}:location:${userInstruction}`)
    .digest('hex')
    .slice(0, 16)

  const payload = {
    userInstruction,
    analysisModel: userConfig.analysisModel,
    displayMode: 'detail' as const}

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
    targetType: 'GlobalAssetHubLocationDesign',
    targetId: session.user.id,
    routePath: '/api/asset-hub/ai-design-location',
    body: payload,
    dedupeKey: `asset_hub_ai_design_location:${dedupeDigest}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
