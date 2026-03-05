import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type VideoMode = 'generate' | 'regenerate' | 'upload'

type SegmentVideoBody = {
  mode?: VideoMode
  prompt?: string
  videoModel?: string
  uploadUrl?: string
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

function asMode(value: unknown): VideoMode | undefined {
  if (value === 'generate' || value === 'regenerate' || value === 'upload') return value
  return undefined
}

function parseBody(raw: unknown): SegmentVideoBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  return {
    mode: asMode(payload.mode) || 'generate',
    prompt: asOptionalString(payload.prompt),
    videoModel: asOptionalString(payload.videoModel),
    uploadUrl: asOptionalString(payload.uploadUrl),
    compareWithTaskId: asOptionalString(payload.compareWithTaskId),
    forceRetry: typeof payload.forceRetry === 'boolean' ? payload.forceRetry : undefined,
  }
}

function resolveLocale(request: NextRequest): Locale {
  const locale = request.nextUrl.searchParams.get('locale') || request.headers.get('x-locale') || 'zh'
  return locale === 'en' ? 'en' : 'zh'
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; segmentId: string }> },
) => {
  const { projectId, segmentId } = await context.params
  if (!projectId || !segmentId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 与 segmentId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session, project } = authResult

  const body = parseBody(await request.json())
  const locale = resolveLocale(request)

  const segment = await prisma.segment.findFirst({
    where: {
      id: segmentId,
      episode: {
        projectId,
      },
    },
    select: {
      id: true,
      episodeId: true,
      segmentVideo: {
        select: {
          id: true,
          videoUrl: true,
        },
      },
    },
  })

  if (!segment) {
    throw new ApiError('NOT_FOUND', { message: '片段不存在' })
  }

  if (body.mode === 'upload' || body.uploadUrl) {
    const uploadUrl = body.uploadUrl
    if (!uploadUrl) {
      throw new ApiError('INVALID_PARAMS', { message: 'upload 模式必须提供 uploadUrl' })
    }

    await prisma.segmentVideo.upsert({
      where: { segmentId: segment.id },
      create: {
        segmentId: segment.id,
        videoUrl: uploadUrl,
        videoPrompt: body.prompt,
        modelKey: body.videoModel,
        status: 'uploaded',
      },
      update: {
        videoUrl: uploadUrl,
        videoPrompt: body.prompt,
        modelKey: body.videoModel,
        status: 'uploaded',
      },
    })

    return NextResponse.json({
      ok: true,
      mode: 'upload',
      segmentId: segment.id,
      saved: true,
      videoUrl: uploadUrl,
    })
  }

  const videoModel = body.videoModel || (typeof project.videoModel === 'string' ? project.videoModel.trim() : '')
  if (!videoModel) {
    throw new ApiError('INVALID_PARAMS', { message: 'videoModel 不能为空' })
  }

  const taskType = TASK_TYPE.VIDEO_PANEL
  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    episodeId: segment.episodeId,
    type: taskType,
    targetType: 'segment',
    targetId: segment.id,
    dedupeKey: body.forceRetry ? null : `${taskType}:${segment.id}`,
    payload: {
      projectId,
      episodeId: segment.episodeId,
      segmentId: segment.id,
      mode: body.mode || 'generate',
      videoPrompt: body.prompt || '',
      videoModel,
      force: body.mode === 'regenerate',
      videoAssetSchema: {
        schema: 'segment_video_asset',
        version: 'v2',
        lifecycle: ['generate', 'regenerate', 'upload', 'download'],
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
      segmentId: segment.id,
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
