import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { retryFailedStep, getRunById } from '@/lib/run-runtime/service'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'

const RETRY_SUPPORTED_TASK_TYPES: ReadonlySet<string> = new Set<string>([
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
])

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveTaskType(run: {
  workflowType: string
  taskType: string | null
}): TaskType {
  const candidate = readString(run.taskType || run.workflowType)
  if (!candidate || !RETRY_SUPPORTED_TASK_TYPES.has(candidate)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'RUN_STEP_RETRY_UNSUPPORTED_TASK_TYPE',
      taskType: candidate || null,
    })
  }
  return candidate as TaskType
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ runId: string; stepKey: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { runId, stepKey: rawStepKey } = await context.params
  const stepKey = decodeURIComponent(rawStepKey || '').trim()
  if (!runId || !stepKey) {
    throw new ApiError('INVALID_PARAMS')
  }

  const run = await getRunById(runId)
  if (!run || run.userId !== session.user.id) {
    throw new ApiError('NOT_FOUND')
  }

  const body = await request.json().catch(() => null)
  const payload = toObject(body)
  const modelOverride = readString(payload.modelOverride)
  const reason = readString(payload.reason)

  let prepared: Awaited<ReturnType<typeof retryFailedStep>> = null
  try {
    prepared = await retryFailedStep({
      runId,
      userId: session.user.id,
      stepKey,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'RUN_STEP_NOT_FOUND') {
      throw new ApiError('NOT_FOUND')
    }
    if (message === 'RUN_STEP_NOT_FAILED') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'RUN_STEP_RETRY_ONLY_FAILED',
        stepKey,
      })
    }
    throw error
  }
  if (!prepared) {
    throw new ApiError('NOT_FOUND')
  }

  const taskType = resolveTaskType(run)
  const locale = resolveRequiredTaskLocale(request, payload)
  const runInput = toObject(run.input)
  const taskPayload: Record<string, unknown> = {
    ...runInput,
    episodeId: run.episodeId || runInput.episodeId || null,
    runId,
    retryStepKey: stepKey,
    retryStepAttempt: prepared.retryAttempt,
    retryReason: reason || null,
    displayMode: 'detail',
    meta: {
      ...toObject(runInput.meta),
      locale,
      runId,
      retryStepKey: stepKey,
      retryStepAttempt: prepared.retryAttempt,
      retryReason: reason || null,
    },
  }
  if (modelOverride) {
    taskPayload.model = modelOverride
    taskPayload.analysisModel = modelOverride
  }

  const submitResult = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId: run.projectId,
    episodeId: run.episodeId || null,
    type: taskType,
    targetType: run.targetType,
    targetId: run.targetId,
    payload: taskPayload,
    dedupeKey: null,
    priority: 3,
  })

  return NextResponse.json({
    success: true,
    runId,
    stepKey,
    retryAttempt: prepared.retryAttempt,
    taskId: submitResult.taskId,
    async: true,
  })
})
