import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type BuildContextBody = {
  promptAppend?: string
  forceRefresh?: boolean
  compareWithTaskId?: string
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

function parseBody(raw: unknown): BuildContextBody {
  const payload = asObject(raw)
  if (!payload) return {}
  return {
    promptAppend: asOptionalString(payload.promptAppend),
    forceRefresh: asOptionalBoolean(payload.forceRefresh),
    compareWithTaskId: asOptionalString(payload.compareWithTaskId),
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
      description: true,
      globalContext: true,
      novelText: true,
    },
  })
  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  const payload = {
    projectId,
    source: {
      description: project.description || '',
      novelText: project.novelText || '',
      existingContext: project.globalContext || '',
    },
    globalContextSchema: {
      schema: 'global_context',
      version: 'v2',
      sections: ['worldRules', 'characterRelations', 'styleConstraints'],
    },
    versioning: {
      compareWithTaskId: body.compareWithTaskId || null,
      compareWithLatest: true,
    },
    promptAppend: body.promptAppend || '',
    forceRefresh: body.forceRefresh === true,
  }

  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    type: TASK_TYPE.ANALYZE_GLOBAL,
    targetType: 'project',
    targetId: projectId,
    dedupeKey: body.forceRefresh ? null : `analyze_global:${projectId}`,
    payload,
    requestId: request.headers.get('x-request-id'),
  })

  return NextResponse.json(
    {
      ok: true,
      task: {
        id: submission.taskId,
        type: TASK_TYPE.ANALYZE_GLOBAL,
        status: submission.status,
        deduped: submission.deduped,
        runId: submission.runId,
      },
    },
    { status: 202 },
  )
})
