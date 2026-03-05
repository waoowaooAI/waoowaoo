import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'

type SplitEpisodesBody = {
  desiredEpisodeCount?: number
  strategy?: string
  contextOverride?: string
  compareWithTaskId?: string
  forceRetry?: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const integer = Math.floor(value)
  return integer > 0 ? integer : null
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') return undefined
  return value
}

function parseBody(raw: unknown): SplitEpisodesBody {
  const payload = asObject(raw)
  if (!payload) return {}

  let desiredEpisodeCount: number | undefined
  if (payload.desiredEpisodeCount !== undefined) {
    const parsed = asPositiveInt(payload.desiredEpisodeCount)
    if (parsed === null) {
      throw new ApiError('INVALID_PARAMS', { message: 'desiredEpisodeCount 必须是正整数' })
    }
    desiredEpisodeCount = parsed
  }

  return {
    desiredEpisodeCount,
    strategy: asOptionalString(payload.strategy),
    contextOverride: asOptionalString(payload.contextOverride),
    compareWithTaskId: asOptionalString(payload.compareWithTaskId),
    forceRetry: asOptionalBoolean(payload.forceRetry),
  }
}

function resolveLocale(request: NextRequest): Locale {
  const locale = request.nextUrl.searchParams.get('locale') || request.headers.get('x-locale') || 'zh'
  return locale === 'en' ? 'en' : 'zh'
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  if (!projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = parseBody(await request.json().catch(() => ({})))
  const locale = resolveLocale(request)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      episodeCount: true,
      segmentDuration: true,
      episodeDuration: true,
      totalDuration: true,
      globalContext: true,
      novelText: true,
    },
  })
  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  const desiredEpisodeCount = body.desiredEpisodeCount || project.episodeCount
  if (desiredEpisodeCount <= 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'desiredEpisodeCount 必须大于 0' })
  }

  const payload = {
    projectId: project.id,
    desiredEpisodeCount,
    strategy: body.strategy || 'balanced',
    content: body.contextOverride || project.novelText || project.globalContext || '',
    episodePlanSchema: {
      schema: 'episode_plan',
      version: 'v2',
      rhythmAnchorFields: ['hook', 'twist', 'conflict'],
    },
    versioning: {
      compareWithTaskId: body.compareWithTaskId || null,
      compareWithLatest: true,
    },
    retryPolicy: {
      maxAttempts: 2,
      mode: 'explicit_fail',
    },
    timing: {
      segmentDurationSec: project.segmentDuration,
      episodeDurationSec: project.episodeDuration,
      totalDurationSec: project.totalDuration,
    },
  }

  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    type: TASK_TYPE.EPISODE_SPLIT_LLM,
    targetType: 'project',
    targetId: projectId,
    dedupeKey: body.forceRetry ? null : `episode_split_llm:${projectId}`,
    payload,
    requestId: request.headers.get('x-request-id'),
  })

  return NextResponse.json(
    {
      ok: true,
      task: {
        id: submission.taskId,
        type: TASK_TYPE.EPISODE_SPLIT_LLM,
        status: submission.status,
        deduped: submission.deduped,
        runId: submission.runId,
      },
    },
    { status: 202 },
  )
})
