import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

/**
 * 资产中心 - AI 修改角色形象描述（任务化）
 * POST /api/asset-hub/ai-modify-character
 * body: { characterId, appearanceIndex, currentDescription, modifyInstruction }
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const payload = await request.json()
  const { characterId, appearanceIndex, currentDescription, modifyInstruction } = payload ?? {}

  if (!characterId || appearanceIndex === undefined || !currentDescription || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }

  const character = await prisma.globalCharacter.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true }})
  if (!character || character.userId !== session.user.id) {
    throw new ApiError('NOT_FOUND')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER,
    targetType: 'GlobalCharacter',
    targetId: characterId,
    routePath: '/api/asset-hub/ai-modify-character',
    body: { characterId, appearanceIndex, currentDescription, modifyInstruction },
    dedupeKey: `asset_hub_ai_modify_character:${characterId}:${appearanceIndex}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
