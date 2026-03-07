import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { createRun, listRuns } from '@/lib/run-runtime/service'
import { RUN_STATUS, type RunStatus } from '@/lib/run-runtime/types'

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeStatus(value: string | null): RunStatus | null {
  if (!value) return null
  if (
    value === RUN_STATUS.QUEUED ||
    value === RUN_STATUS.RUNNING ||
    value === RUN_STATUS.COMPLETED ||
    value === RUN_STATUS.FAILED ||
    value === RUN_STATUS.CANCELING ||
    value === RUN_STATUS.CANCELED
  ) return value
  return null
}

function normalizeStatuses(values: string[]): RunStatus[] {
  const next: RunStatus[] = []
  for (const value of values) {
    const normalized = normalizeStatus(readString(value))
    if (!normalized) continue
    if (!next.includes(normalized)) {
      next.push(normalized)
    }
  }
  return next
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const query = request.nextUrl.searchParams
  const projectId = readString(query.get('projectId'))
  const workflowType = readString(query.get('workflowType'))
  const targetType = readString(query.get('targetType'))
  const targetId = readString(query.get('targetId'))
  const episodeId = readString(query.get('episodeId'))
  const statuses = normalizeStatuses(query.getAll('status'))
  const limitRaw = Number.parseInt(query.get('limit') || '50', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50
  const runs = await listRuns({
    userId: session.user.id,
    projectId: projectId || undefined,
    workflowType: workflowType || undefined,
    targetType: targetType || undefined,
    targetId: targetId || undefined,
    episodeId: episodeId || undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    limit,
  })
  return NextResponse.json({ runs })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('INVALID_PARAMS')
  }

  const payload = body as Record<string, unknown>
  const projectId = readString(payload.projectId)
  const workflowType = readString(payload.workflowType)
  const targetType = readString(payload.targetType)
  const targetId = readString(payload.targetId)
  const episodeId = readString(payload.episodeId)
  const taskType = readString(payload.taskType)
  const taskId = readString(payload.taskId)
  const input = payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
    ? (payload.input as Record<string, unknown>)
    : null

  if (!projectId || !workflowType || !targetType || !targetId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const run = await createRun({
    userId: session.user.id,
    projectId,
    episodeId,
    workflowType,
    taskType,
    taskId,
    targetType,
    targetId,
    input,
  })
  return NextResponse.json({
    success: true,
    runId: run.id,
    run,
  })
})
