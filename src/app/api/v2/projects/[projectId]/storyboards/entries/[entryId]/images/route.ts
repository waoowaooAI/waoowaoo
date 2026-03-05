import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type ImageMode = 'generate' | 'regenerate' | 'redo' | 'upload'
type ImageLayout = 4 | 9 | 16

type ManageStoryboardImageBody = {
  mode?: ImageMode
  uploadUrl?: string
  prompt?: string
  layout?: ImageLayout
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

function asMode(value: unknown): ImageMode | undefined {
  if (value === 'generate' || value === 'regenerate' || value === 'redo' || value === 'upload') return value
  return undefined
}

function asLayout(value: unknown): ImageLayout | undefined {
  if (value === 4 || value === 9 || value === 16) return value
  return undefined
}

function parseBody(raw: unknown): ManageStoryboardImageBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const mode = asMode(payload.mode) || 'generate'
  const uploadUrl = asOptionalString(payload.uploadUrl)

  return {
    mode,
    uploadUrl,
    prompt: asOptionalString(payload.prompt),
    layout: asLayout(payload.layout) || 9,
    compareWithTaskId: asOptionalString(payload.compareWithTaskId),
    forceRetry: typeof payload.forceRetry === 'boolean' ? payload.forceRetry : undefined,
  }
}

function resolveLocale(request: NextRequest): Locale {
  const locale = request.nextUrl.searchParams.get('locale') || request.headers.get('x-locale') || 'zh'
  return locale === 'en' ? 'en' : 'zh'
}

function resolveTaskType(mode: ImageMode) {
  if (mode === 'regenerate') return TASK_TYPE.MODIFY_ASSET_IMAGE
  return TASK_TYPE.IMAGE_PANEL
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; entryId: string }> },
) => {
  const { projectId, entryId } = await context.params
  if (!projectId || !entryId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 与 entryId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = parseBody(await request.json())
  const locale = resolveLocale(request)

  const entry = await prisma.storyboardEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      segmentId: true,
      imageUrl: true,
      segment: {
        select: {
          episodeId: true,
          episode: {
            select: {
              projectId: true,
            },
          },
        },
      },
    },
  })

  if (!entry || entry.segment.episode.projectId !== projectId) {
    throw new ApiError('NOT_FOUND', { message: '分镜条目不存在' })
  }

  if (body.mode === 'upload' || body.uploadUrl) {
    const uploadUrl = body.uploadUrl
    if (!uploadUrl) {
      throw new ApiError('INVALID_PARAMS', { message: 'upload 模式必须提供 uploadUrl' })
    }

    await prisma.storyboardEntry.update({
      where: { id: entry.id },
      data: {
        previousImageUrl: entry.imageUrl || undefined,
        imageUrl: uploadUrl,
        ...(body.prompt ? { imagePrompt: body.prompt } : {}),
      },
    })

    return NextResponse.json({
      ok: true,
      mode: 'upload',
      saved: true,
      layout: body.layout || 9,
    })
  }

  const taskType = resolveTaskType(body.mode || 'generate')
  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    episodeId: entry.segment.episodeId,
    type: taskType,
    targetType: 'storyboard_entry',
    targetId: entry.id,
    dedupeKey: body.forceRetry ? null : `${taskType}:${entry.id}:layout:${body.layout || 9}`,
    payload: {
      projectId,
      episodeId: entry.segment.episodeId,
      segmentId: entry.segmentId,
      storyboardEntryId: entry.id,
      panelId: entry.id,
      type: 'storyboard',
      mode: body.mode || 'generate',
      layout: body.layout || 9,
      prompt: body.prompt || '',
      force: body.mode === 'redo',
      storyboardImageSchema: {
        schema: 'storyboard_image',
        version: 'v2',
        defaultLayout: 9,
        layouts: [4, 9, 16],
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
      layout: body.layout || 9,
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
