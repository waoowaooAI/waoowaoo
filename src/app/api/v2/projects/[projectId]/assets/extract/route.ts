import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'

type ExtractAssetsBody = {
  extractCharacters?: boolean
  extractLocations?: boolean
  extractProps?: boolean
  contextOverride?: string
  compareWithTaskId?: string
  forceRetry?: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseBody(raw: unknown): ExtractAssetsBody {
  const payload = asObject(raw)
  if (!payload) return {}
  return {
    extractCharacters: asOptionalBoolean(payload.extractCharacters),
    extractLocations: asOptionalBoolean(payload.extractLocations),
    extractProps: asOptionalBoolean(payload.extractProps),
    contextOverride: asOptionalString(payload.contextOverride),
    compareWithTaskId: asOptionalString(payload.compareWithTaskId),
    forceRetry: asOptionalBoolean(payload.forceRetry),
  }
}

function resolveLocale(request: NextRequest): Locale {
  const locale = request.nextUrl.searchParams.get('locale') || request.headers.get('x-locale') || 'zh'
  return locale === 'en' ? 'en' : 'zh'
}

type ExtractTaskDef = {
  type: TaskType
  key: 'characters' | 'locations' | 'props'
}

const TASK_DEFS: ExtractTaskDef[] = [
  { type: TASK_TYPE.EXTRACT_CHARACTERS_LLM, key: 'characters' },
  { type: TASK_TYPE.EXTRACT_LOCATIONS_LLM, key: 'locations' },
  { type: TASK_TYPE.EXTRACT_PROPS_LLM, key: 'props' },
]

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
      globalContext: true,
      novelText: true,
      description: true,
    },
  })
  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  const enabled = {
    characters: body.extractCharacters !== false,
    locations: body.extractLocations !== false,
    props: body.extractProps !== false,
  }
  if (!enabled.characters && !enabled.locations && !enabled.props) {
    throw new ApiError('INVALID_PARAMS', { message: '至少需要开启一个抽取项' })
  }

  const basePayload = {
    projectId,
    context: body.contextOverride || project.globalContext || project.novelText || project.description || '',
    extractionSchema: {
      schema: 'asset_extract',
      version: 'v2',
      dedupe: true,
      aliasMerge: true,
      sourceRefField: 'sourceSegmentIds',
    },
    versioning: {
      compareWithTaskId: body.compareWithTaskId || null,
      compareWithLatest: true,
    },
    source: {
      description: project.description || '',
      novelText: project.novelText || '',
      globalContext: project.globalContext || '',
    },
  }

  const submissions = await Promise.all(
    TASK_DEFS
      .filter((item) => enabled[item.key])
      .map(async (item) => {
        const result = await submitTask({
          userId: session.user.id,
          locale,
          projectId,
          type: item.type,
          targetType: 'project',
          targetId: projectId,
          dedupeKey: body.forceRetry ? null : `${item.type}:${projectId}`,
          payload: {
            ...basePayload,
            extractType: item.key,
          },
          requestId: request.headers.get('x-request-id'),
        })
        return {
          id: result.taskId,
          type: item.type,
          status: result.status,
          deduped: result.deduped,
          runId: result.runId,
        }
      }),
  )

  return NextResponse.json(
    {
      ok: true,
      tasks: submissions,
    },
    { status: 202 },
  )
})
