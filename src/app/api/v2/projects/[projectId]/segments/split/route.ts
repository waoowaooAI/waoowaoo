import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import type { Locale } from '@/i18n/routing'

type SplitSegmentsBody = {
  episodeId?: string
  desiredSegmentsPerEpisode?: number
  contextOverride?: string
  compareWithTaskId?: string
  forceRetry?: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const integer = Math.floor(value)
  return integer > 0 ? integer : null
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') return undefined
  return value
}

function parseBody(raw: unknown): SplitSegmentsBody {
  const payload = asObject(raw)
  if (!payload) return {}

  const desiredSegmentsPerEpisode =
    payload.desiredSegmentsPerEpisode === undefined
      ? undefined
      : asPositiveInt(payload.desiredSegmentsPerEpisode)
  if (payload.desiredSegmentsPerEpisode !== undefined && desiredSegmentsPerEpisode === null) {
    throw new ApiError('INVALID_PARAMS', { message: 'desiredSegmentsPerEpisode 必须是正整数' })
  }

  return {
    episodeId: asOptionalString(payload.episodeId),
    desiredSegmentsPerEpisode: desiredSegmentsPerEpisode || undefined,
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
      segmentDuration: true,
      episodeDuration: true,
      episodeCount: true,
      globalContext: true,
      novelText: true,
    },
  })
  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  if (!body.episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId 不能为空' })
  }
  const episode = await prisma.episode.findUnique({
    where: { id: body.episodeId },
    select: {
      id: true,
      projectId: true,
      novelText: true,
      context: true,
    },
  })
  if (!episode || episode.projectId !== projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId 不属于当前项目' })
  }

  const suggestedSegments = body.desiredSegmentsPerEpisode
    || Math.max(1, Math.floor(project.episodeDuration / Math.max(1, project.segmentDuration)))
  const content =
    body.contextOverride
    || episode.novelText
    || episode.context
    || project.novelText
    || project.globalContext
    || ''
  if (!content.trim()) {
    throw new ApiError('INVALID_PARAMS', { message: '缺少片段拆分内容，请先提供剧集正文或上下文' })
  }

  const payload = {
    projectId,
    episodeId: body.episodeId,
    desiredSegmentsPerEpisode: suggestedSegments,
    content,
    clipPlanSchema: {
      schema: 'clip_plan',
      version: 'v2',
      fields: [
        'index',
        'summary',
        'splitReason',
        'boundaryMarkers',
        'targetDurationSec',
        'estimatedDurationSec',
        'durationDeltaSec',
      ],
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
      episodeCount: project.episodeCount,
    },
  }

  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    episodeId: body.episodeId,
    type: TASK_TYPE.SEGMENT_SPLIT_LLM,
    targetType: 'episode',
    targetId: body.episodeId,
    dedupeKey: body.forceRetry ? null : `segment_split_llm:${body.episodeId}`,
    payload,
    requestId: request.headers.get('x-request-id'),
  })

  return NextResponse.json(
    {
      ok: true,
      task: {
        id: submission.taskId,
        type: TASK_TYPE.SEGMENT_SPLIT_LLM,
        status: submission.status,
        deduped: submission.deduped,
        runId: submission.runId,
      },
    },
    { status: 202 },
  )
})
