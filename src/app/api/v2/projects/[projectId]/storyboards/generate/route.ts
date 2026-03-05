import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type GenerateStoryboardBody = {
  episodeId?: string
  segmentId?: string
  mode?: 'generate' | 'regenerate'
  promptAppend?: string
  forceRefresh?: boolean
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

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asMode(value: unknown): 'generate' | 'regenerate' | undefined {
  if (value === 'generate' || value === 'regenerate') return value
  return undefined
}

function parseBody(raw: unknown): GenerateStoryboardBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  return {
    episodeId: asOptionalString(payload.episodeId),
    segmentId: asOptionalString(payload.segmentId),
    mode: asMode(payload.mode) || 'generate',
    promptAppend: asOptionalString(payload.promptAppend),
    forceRefresh: asOptionalBoolean(payload.forceRefresh),
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

  const body = parseBody(await request.json())
  if (!body.episodeId && !body.segmentId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId 与 segmentId 至少需要提供一个' })
  }

  let targetType: 'episode' | 'segment' = 'episode'
  let targetId = body.episodeId || ''
  let resolvedEpisodeId = body.episodeId || ''

  if (body.segmentId) {
    const segment = await prisma.segment.findFirst({
      where: {
        id: body.segmentId,
        episode: {
          projectId,
        },
      },
      select: {
        id: true,
        episodeId: true,
      },
    })

    if (!segment) {
      throw new ApiError('INVALID_PARAMS', { message: 'segment 不存在或不属于当前项目' })
    }

    targetType = 'segment'
    targetId = segment.id
    resolvedEpisodeId = segment.episodeId
  } else if (body.episodeId) {
    const episode = await prisma.episode.findFirst({
      where: {
        id: body.episodeId,
        projectId,
      },
      select: {
        id: true,
      },
    })

    if (!episode) {
      throw new ApiError('INVALID_PARAMS', { message: 'episode 不存在或不属于当前项目' })
    }

    targetType = 'episode'
    targetId = episode.id
    resolvedEpisodeId = episode.id
  }

  const locale = resolveLocale(request)
  const taskType = TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN
  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    episodeId: resolvedEpisodeId,
    type: taskType,
    targetType,
    targetId,
    dedupeKey: body.forceRefresh || body.forceRetry ? null : `${taskType}:${targetType}:${targetId}`,
    payload: {
      projectId,
      episodeId: resolvedEpisodeId,
      segmentId: body.segmentId,
      mode: body.mode || 'generate',
      promptAppend: body.promptAppend || '',
      forceRefresh: body.forceRefresh === true,
      storyboardPanelSchema: {
        schema: 'storyboard_panel',
        version: 'v2',
        fields: ['startSec', 'endSec', 'description', 'dialogue', 'soundEffect', 'dialogueTone'],
      },
      versioning: {
        compareWithTaskId: body.compareWithTaskId || null,
        compareWithLatest: true,
      },
    },
    requestId: request.headers.get('x-request-id'),
  })

  return NextResponse.json(
    {
      ok: true,
      mode: body.mode || 'generate',
      targetType,
      targetId,
      task: {
        id: submission.taskId,
        type: taskType,
        status: submission.status,
        deduped: submission.deduped,
        runId: submission.runId,
      },
    },
    { status: 202 },
  )
})
