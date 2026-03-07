import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  isErrorResponse,
  requireProjectAuthLight,
  requireUserAuth} from '@/lib/api-auth'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { queryTaskTargetStates, type TaskTargetQuery } from '@/lib/task/state-service'

function normalizeTarget(input: unknown): TaskTargetQuery {
  const payload = input as Record<string, unknown>
  const targetType = typeof payload.targetType === 'string' ? payload.targetType.trim() : ''
  const targetId = typeof payload.targetId === 'string' ? payload.targetId.trim() : ''
  const types = Array.isArray(payload.types)
    ? payload.types.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined

  if (!targetType || !targetId) {
    throw new ApiError('INVALID_PARAMS')
  }

  return {
    targetType,
    targetId,
    ...(types && types.length > 0 ? { types } : {})}
}

export const POST = apiHandler(async (request: NextRequest) => {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS')
  }
  const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : ''
  const targetsRaw = Array.isArray(body?.targets) ? body.targets : null

  if (!projectId || !targetsRaw) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (targetsRaw.length > 500) {
    throw new ApiError('INVALID_PARAMS')
  }

  const targets = targetsRaw.map(normalizeTarget)

  if (targets.length === 0) {
    return NextResponse.json({ states: [] })
  }

  let userId: string
  if (projectId === 'global-asset-hub') {
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    userId = authResult.session.user.id
  } else {
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    userId = authResult.session.user.id
  }

  const states = await withPrismaRetry(() =>
    queryTaskTargetStates({
      projectId,
      userId,
      targets})
  )

  return NextResponse.json({ states })
})
