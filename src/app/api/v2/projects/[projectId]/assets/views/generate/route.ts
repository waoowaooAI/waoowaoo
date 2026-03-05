import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type AssetType = 'character' | 'location'
type ViewLayout = 4 | 9 | 16

type GenerateViewsBody = {
  assetType: AssetType
  assetId: string
  layout?: ViewLayout
  prompt?: string
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

function asAssetType(value: unknown): AssetType | null {
  if (value === 'character' || value === 'location') return value
  return null
}

function asLayout(value: unknown): ViewLayout | undefined {
  if (value === 4 || value === 9 || value === 16) return value
  return undefined
}

function parseBody(raw: unknown): GenerateViewsBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const assetType = asAssetType(payload.assetType)
  if (!assetType) {
    throw new ApiError('INVALID_PARAMS', { message: 'assetType 必须是 character/location' })
  }

  const assetId = asOptionalString(payload.assetId)
  if (!assetId) {
    throw new ApiError('INVALID_PARAMS', { message: 'assetId 不能为空' })
  }

  return {
    assetType,
    assetId,
    layout: asLayout(payload.layout),
    prompt: asOptionalString(payload.prompt),
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
  const locale = resolveLocale(request)

  if (body.assetType === 'character') {
    const character = await prisma.character.findUnique({
      where: { id: body.assetId },
      select: { id: true, projectId: true, name: true },
    })
    if (!character || character.projectId !== projectId) {
      throw new ApiError('INVALID_PARAMS', { message: 'character 不存在或不属于当前项目' })
    }
  } else {
    const location = await prisma.location.findUnique({
      where: { id: body.assetId },
      select: { id: true, projectId: true, name: true },
    })
    if (!location || location.projectId !== projectId) {
      throw new ApiError('INVALID_PARAMS', { message: 'location 不存在或不属于当前项目' })
    }
  }

  const layout = body.assetType === 'character' ? 4 : (body.layout || 4)
  if (body.assetType === 'character' && body.layout && body.layout !== 4) {
    throw new ApiError('INVALID_PARAMS', { message: '角色三视图仅支持 4 宫格布局' })
  }

  const viewSpec = body.assetType === 'character'
    ? ['portrait', 'front', 'back', 'side']
    : Array.from({ length: layout }, (_, index) => `view_${index + 1}`)

  const taskType = body.assetType === 'character'
    ? TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER
    : TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION

  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    type: taskType,
    targetType: body.assetType,
    targetId: body.assetId,
    dedupeKey: body.forceRetry ? null : `${taskType}:${body.assetId}:layout:${layout}`,
    payload: {
      projectId,
      assetType: body.assetType,
      assetId: body.assetId,
      layout,
      viewSpec,
      prompt: body.prompt || '',
      viewLayoutMeta: {
        schema: 'asset_view_layout',
        version: 'v2',
        characterLayout: 4,
        locationLayouts: [4, 9, 16],
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
      task: {
        id: submission.taskId,
        type: taskType,
        status: submission.status,
        deduped: submission.deduped,
        runId: submission.runId,
      },
      viewSpec,
      layout,
    },
    { status: 202 },
  )
})
