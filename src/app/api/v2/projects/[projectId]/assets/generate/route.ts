import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

type AssetType = 'character' | 'location' | 'prop'
type AssetMode = 'generate' | 'regenerate' | 'redo' | 'upload'

type GenerateAssetBody = {
  assetType: AssetType
  mode?: AssetMode
  assetId?: string
  prompt?: string
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

function asAssetType(value: unknown): AssetType | null {
  if (value === 'character' || value === 'location' || value === 'prop') return value
  return null
}

function asMode(value: unknown): AssetMode | undefined {
  if (value === 'generate' || value === 'regenerate' || value === 'redo' || value === 'upload') return value
  return undefined
}

function parseBody(raw: unknown): GenerateAssetBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const assetType = asAssetType(payload.assetType)
  if (!assetType) {
    throw new ApiError('INVALID_PARAMS', { message: 'assetType 必须是 character/location/prop' })
  }

  return {
    assetType,
    mode: asMode(payload.mode) || 'generate',
    assetId: asOptionalString(payload.assetId),
    prompt: asOptionalString(payload.prompt),
    uploadUrl: asOptionalString(payload.uploadUrl),
    compareWithTaskId: asOptionalString(payload.compareWithTaskId),
    forceRetry: typeof payload.forceRetry === 'boolean' ? payload.forceRetry : undefined,
  }
}

function resolveLocale(request: NextRequest): Locale {
  const locale = request.nextUrl.searchParams.get('locale') || request.headers.get('x-locale') || 'zh'
  return locale === 'en' ? 'en' : 'zh'
}

async function saveUploadedAsset(params: {
  projectId: string
  assetType: AssetType
  assetId?: string
  uploadUrl: string
}) {
  if (params.assetType === 'character') {
    if (!params.assetId) {
      throw new ApiError('INVALID_PARAMS', { message: 'character 上传需要 assetId' })
    }
    const character = await prisma.character.findUnique({
      where: { id: params.assetId },
      select: { id: true, projectId: true },
    })
    if (!character || character.projectId !== params.projectId) {
      throw new ApiError('INVALID_PARAMS', { message: 'character 不存在或不属于当前项目' })
    }
    const existingAppearance = await prisma.characterAppearance.findUnique({
      where: {
        characterId_appearanceIndex: {
          characterId: character.id,
          appearanceIndex: 0,
        },
      },
      select: {
        imageUrl: true,
      },
    })
    await prisma.characterAppearance.upsert({
      where: {
        characterId_appearanceIndex: {
          characterId: character.id,
          appearanceIndex: 0,
        },
      },
      create: {
        characterId: character.id,
        appearanceIndex: 0,
        imageUrl: params.uploadUrl,
      },
      update: {
        previousImageUrl: existingAppearance?.imageUrl || null,
        imageUrl: params.uploadUrl,
      },
    })
    return
  }

  if (params.assetType === 'location') {
    if (!params.assetId) {
      throw new ApiError('INVALID_PARAMS', { message: 'location 上传需要 assetId' })
    }
    const location = await prisma.location.findUnique({
      where: { id: params.assetId },
      select: { id: true, projectId: true },
    })
    if (!location || location.projectId !== params.projectId) {
      throw new ApiError('INVALID_PARAMS', { message: 'location 不存在或不属于当前项目' })
    }
    await prisma.locationImage.upsert({
      where: {
        locationId_imageIndex: {
          locationId: location.id,
          imageIndex: 0,
        },
      },
      create: {
        locationId: location.id,
        imageIndex: 0,
        imageUrl: params.uploadUrl,
      },
      update: {
        imageUrl: params.uploadUrl,
      },
    })
    return
  }

  if (!params.assetId) {
    throw new ApiError('INVALID_PARAMS', { message: 'prop 上传需要 assetId' })
  }
  const prop = await prisma.prop.findUnique({
    where: { id: params.assetId },
    select: { id: true, projectId: true },
  })
  if (!prop || prop.projectId !== params.projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'prop 不存在或不属于当前项目' })
  }
  await prisma.prop.update({
    where: { id: prop.id },
    data: {
      imageUrl: params.uploadUrl,
    },
  })
}

function resolveTaskType(assetType: AssetType, mode: AssetMode) {
  if (assetType === 'character') {
    if (mode === 'generate' || mode === 'redo') return TASK_TYPE.AI_CREATE_CHARACTER
    return TASK_TYPE.AI_MODIFY_APPEARANCE
  }
  if (assetType === 'location') {
    if (mode === 'generate' || mode === 'redo') return TASK_TYPE.AI_CREATE_LOCATION
    return TASK_TYPE.AI_MODIFY_LOCATION
  }
  return mode === 'regenerate' ? TASK_TYPE.ASSET_HUB_MODIFY : TASK_TYPE.ASSET_HUB_IMAGE
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

  if (body.uploadUrl) {
    await saveUploadedAsset({
      projectId,
      assetType: body.assetType,
      assetId: body.assetId,
      uploadUrl: body.uploadUrl,
    })
    return NextResponse.json({
      ok: true,
      mode: 'upload',
      saved: true,
    })
  }

  const taskType = resolveTaskType(body.assetType, body.mode || 'generate')
  const targetId = body.assetId || projectId
  const targetType = body.assetId ? body.assetType : 'project'

  const submission = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    type: taskType,
    targetType,
    targetId,
    dedupeKey: body.forceRetry ? null : `${taskType}:${targetId}`,
    payload: {
      projectId,
      assetType: body.assetType,
      mode: body.mode || 'generate',
      prompt: body.prompt || '',
      force: body.mode === 'redo',
      assetCardSchema: {
        schema: 'asset_card',
        version: 'v2',
        modes: ['upload', 'generate', 'regenerate', 'redo'],
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
