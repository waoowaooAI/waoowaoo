import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type RegenerateField = 'description' | 'dialogue' | 'soundEffect' | 'dialogueTone'

type RegenerateStoryboardEntryBody = {
  fields?: RegenerateField[]
  promptAppend?: string
  compareWithTaskId?: string
  forceRetry?: boolean
}

const DEFAULT_FIELDS: RegenerateField[] = ['description', 'dialogue', 'soundEffect', 'dialogueTone']

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asFields(value: unknown): RegenerateField[] | undefined {
  if (!Array.isArray(value)) return undefined

  const allowed = new Set<RegenerateField>(DEFAULT_FIELDS)
  const normalized = value.map((item) => (typeof item === 'string' ? item.trim() : ''))
  if (normalized.some((item) => !allowed.has(item as RegenerateField))) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'fields 仅支持 description/dialogue/soundEffect/dialogueTone',
    })
  }

  const unique = Array.from(new Set(normalized)) as RegenerateField[]
  if (unique.length === 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'fields 不能为空数组' })
  }

  return unique
}

function parseBody(raw: unknown): RegenerateStoryboardEntryBody {
  const payload = asObject(raw)
  if (!payload) return { fields: DEFAULT_FIELDS }

  return {
    fields: asFields(payload.fields) || DEFAULT_FIELDS,
    promptAppend: asOptionalString(payload.promptAppend),
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
  context: { params: Promise<{ projectId: string; entryId: string }> },
) => {
  const { projectId, entryId } = await context.params
  if (!projectId || !entryId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 与 entryId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = parseBody(await request.json().catch(() => ({})))
  const locale = resolveLocale(request)

  const entry = await prisma.storyboardEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      segmentId: true,
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

  const taskType = TASK_TYPE.REGENERATE_STORYBOARD_TEXT
  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    episodeId: entry.segment.episodeId,
    type: taskType,
    targetType: 'storyboard_entry',
    targetId: entry.id,
    dedupeKey: body.forceRetry ? null : `${taskType}:${entry.id}`,
    payload: {
      projectId,
      episodeId: entry.segment.episodeId,
      segmentId: entry.segmentId,
      storyboardEntryId: entry.id,
      fields: body.fields || DEFAULT_FIELDS,
      promptAppend: body.promptAppend || '',
      mode: 'partial_regenerate',
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
      regenerate: {
        entryId: entry.id,
        fields: body.fields || DEFAULT_FIELDS,
      },
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
