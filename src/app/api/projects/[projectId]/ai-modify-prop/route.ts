import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const propId = typeof body?.propId === 'string' ? body.propId.trim() : ''
  const variantId = typeof body?.variantId === 'string' ? body.variantId.trim() : ''
  const currentDescription = typeof body?.currentDescription === 'string' ? body.currentDescription.trim() : ''
  const modifyInstruction = typeof body?.modifyInstruction === 'string' ? body.modifyInstruction.trim() : ''

  if (!propId || !currentDescription || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }

  const prop = await prisma.projectLocation.findFirst({
    where: {
      id: propId,
      projectId,
      assetKind: 'prop',
    },
    select: {
      id: true,
      name: true,
    },
  })
  if (!prop) {
    throw new ApiError('NOT_FOUND')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    type: TASK_TYPE.AI_MODIFY_PROP,
    targetType: 'ProjectLocation',
    targetId: variantId || propId,
    routePath: `/api/projects/${projectId}/ai-modify-prop`,
    body: {
      propId,
      propName: prop.name,
      variantId: variantId || undefined,
      currentDescription,
      modifyInstruction,
    },
    dedupeKey: `ai_modify_prop:${propId}:${variantId || 'default'}`,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
