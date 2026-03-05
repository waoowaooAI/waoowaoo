import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { toMoneyNumber } from '@/lib/billing/money'
import { prisma } from '@/lib/prisma'

type CreateProjectBody = {
  name?: string
  description: string
  novelScript?: string | null
  videoModel?: string
  segmentDurationSec: number
  segmentsPerEpisode: number
  episodeCount: number
  episodeDurationSec?: number
  totalDurationSec?: number
}

type ListQuery = {
  page: number
  pageSize: number
  search: string
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const integer = Math.floor(value)
  return integer > 0 ? integer : null
}

function parsePositiveIntFromQuery(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function parseListQuery(request: NextRequest): ListQuery {
  const page = parsePositiveIntFromQuery(request.nextUrl.searchParams.get('page'), 1)
  const rawPageSize = parsePositiveIntFromQuery(request.nextUrl.searchParams.get('pageSize'), 7)
  const pageSize = Math.min(50, rawPageSize)
  const search = (request.nextUrl.searchParams.get('search') || '').trim()
  return {
    page,
    pageSize,
    search,
  }
}

function parseCreateBody(raw: unknown): CreateProjectBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const description = asNonEmptyString(payload.description)
  const segmentDurationSec = asPositiveInt(payload.segmentDurationSec)
  const segmentsPerEpisode = asPositiveInt(payload.segmentsPerEpisode)
  const episodeCount = asPositiveInt(payload.episodeCount)

  if (!description) {
    throw new ApiError('INVALID_PARAMS', { message: 'description 不能为空' })
  }
  if (!segmentDurationSec) {
    throw new ApiError('INVALID_PARAMS', { message: 'segmentDurationSec 必须是正整数' })
  }
  if (!segmentsPerEpisode) {
    throw new ApiError('INVALID_PARAMS', { message: 'segmentsPerEpisode 必须是正整数' })
  }
  if (!episodeCount) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeCount 必须是正整数' })
  }

  let episodeDurationSec: number | undefined
  if (payload.episodeDurationSec !== undefined) {
    const parsed = asPositiveInt(payload.episodeDurationSec)
    if (parsed === null) {
      throw new ApiError('INVALID_PARAMS', { message: 'episodeDurationSec 必须是正整数' })
    }
    episodeDurationSec = parsed
  }

  let totalDurationSec: number | undefined
  if (payload.totalDurationSec !== undefined) {
    const parsed = asPositiveInt(payload.totalDurationSec)
    if (parsed === null) {
      throw new ApiError('INVALID_PARAMS', { message: 'totalDurationSec 必须是正整数' })
    }
    totalDurationSec = parsed
  }

  const name = asNonEmptyString(payload.name) || undefined
  const novelScript = payload.novelScript === null
    ? null
    : asNonEmptyString(payload.novelScript) || undefined
  const videoModel = asNonEmptyString(payload.videoModel) || undefined
  if (videoModel && !parseModelKeyStrict(videoModel)) {
    throw new ApiError('INVALID_PARAMS', { message: 'videoModel 必须是 provider::modelId 格式' })
  }

  return {
    name,
    description,
    novelScript,
    videoModel,
    segmentDurationSec,
    segmentsPerEpisode,
    episodeCount,
    episodeDurationSec,
    totalDurationSec,
  }
}

function deriveProjectDuration(input: CreateProjectBody) {
  const expectedEpisodeDuration = input.segmentDurationSec * input.segmentsPerEpisode
  if (
    typeof input.episodeDurationSec === 'number'
    && input.episodeDurationSec !== expectedEpisodeDuration
  ) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'episodeDurationSec 与公式不一致，必须等于 segmentDurationSec * segmentsPerEpisode',
      expectedEpisodeDurationSec: expectedEpisodeDuration,
      actualEpisodeDurationSec: input.episodeDurationSec,
    })
  }

  const expectedTotalDuration = expectedEpisodeDuration * input.episodeCount
  if (
    typeof input.totalDurationSec === 'number'
    && input.totalDurationSec !== expectedTotalDuration
  ) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'totalDurationSec 与公式不一致，必须等于 episodeDurationSec * episodeCount',
      expectedTotalDurationSec: expectedTotalDuration,
      actualTotalDurationSec: input.totalDurationSec,
    })
  }

  return {
    episodeDurationSec: expectedEpisodeDuration,
    totalDurationSec: expectedTotalDuration,
  }
}

function buildProjectName(input: CreateProjectBody) {
  if (input.name) return input.name
  const base = input.description.slice(0, 24).trim()
  return base || `iVibeMovie 项目 ${new Date().toISOString().slice(0, 10)}`
}

type CorrectionSuggestion = {
  segmentDurationSec: number
  segmentsPerEpisode: number
  episodeDurationSec: number
  totalDurationSec: number
}

function buildCorrectionSuggestion(input: CreateProjectBody, modelSegmentDurationLimitSec: number): CorrectionSuggestion {
  const targetEpisodeDurationSec = input.segmentDurationSec * input.segmentsPerEpisode
  const segmentsPerEpisode = Math.max(1, Math.ceil(targetEpisodeDurationSec / modelSegmentDurationLimitSec))
  const segmentDurationSec = Math.max(1, Math.ceil(targetEpisodeDurationSec / segmentsPerEpisode))
  const episodeDurationSec = segmentDurationSec * segmentsPerEpisode
  const totalDurationSec = episodeDurationSec * input.episodeCount
  return {
    segmentDurationSec,
    segmentsPerEpisode,
    episodeDurationSec,
    totalDurationSec,
  }
}

function resolveVideoModelDurationLimitSec(modelKey: string): number | null {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) {
    throw new ApiError('INVALID_PARAMS', { message: 'videoModel 必须是 provider::modelId 格式' })
  }
  const capabilities = findBuiltinCapabilities('video', parsed.provider, parsed.modelId)
  const options = capabilities?.video?.durationOptions
  if (!Array.isArray(options) || options.length === 0) return null
  const durations = options.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (durations.length === 0) return null
  return Math.max(...durations)
}

async function resolveVideoModelKey(input: {
  userId: string
  requestVideoModel?: string
}): Promise<string> {
  if (input.requestVideoModel) return input.requestVideoModel

  const preference = await prisma.userPreference.findUnique({
    where: { userId: input.userId },
    select: { videoModel: true },
  })
  const modelKey = asNonEmptyString(preference?.videoModel)
  if (!modelKey) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'videoModel 未配置，无法校验片段时长上限；请在请求中传入 videoModel 或先配置用户默认视频模型',
    })
  }
  if (!parseModelKeyStrict(modelKey)) {
    throw new ApiError('INVALID_PARAMS', {
      message: '用户默认 videoModel 配置非法，必须是 provider::modelId 格式',
      configuredVideoModel: modelKey,
    })
  }
  return modelKey
}

function validateSegmentDurationAgainstModelLimit(input: {
  body: CreateProjectBody
  modelSegmentDurationLimitSec: number
  videoModel: string
}) {
  const { body, modelSegmentDurationLimitSec, videoModel } = input
  if (body.segmentDurationSec <= modelSegmentDurationLimitSec) return
  throw new ApiError('INVALID_PARAMS', {
    message: 'segmentDurationSec 超过视频模型支持上限，请按建议参数调整',
    actualSegmentDurationSec: body.segmentDurationSec,
    modelSegmentDurationLimitSec,
    videoModel,
    suggestion: buildCorrectionSuggestion(body, modelSegmentDurationLimitSec),
  })
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { page, pageSize, search } = parseListQuery(request)
  const where = {
    userId: session.user.id,
    ...(search
      ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }
      : {}),
  }

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: [
        { lastAccessedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  const projectIds = projects.map((project) => project.id)
  const [costRows, episodeRows] = await Promise.all([
    projectIds.length > 0
      ? prisma.usageCost.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: projectIds },
        },
        _sum: {
          cost: true,
        },
      })
      : Promise.resolve([]),
    projectIds.length > 0
      ? prisma.episode.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: projectIds },
        },
        _count: {
          _all: true,
        },
      })
      : Promise.resolve([]),
  ])

  const totalCostByProjectId = new Map(
    costRows
      .filter((row) => typeof row.projectId === 'string' && row.projectId)
      .map((row) => [row.projectId as string, toMoneyNumber(row._sum.cost)]),
  )
  const episodeCountByProjectId = new Map(
    episodeRows.map((row) => [row.projectId, row._count._all]),
  )

  return NextResponse.json({
    ok: true,
    projects: projects.map((project) => {
      const episodes = episodeCountByProjectId.get(project.id) || 0
      return {
        ...project,
        totalCost: totalCostByProjectId.get(project.id) ?? 0,
        stats: {
          episodes,
          images: 0,
          videos: 0,
          panels: 0,
          firstEpisodePreview: null,
        },
      }
    }),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = parseCreateBody(await request.json())
  const duration = deriveProjectDuration(body)
  const videoModel = await resolveVideoModelKey({
    userId: session.user.id,
    requestVideoModel: body.videoModel,
  })
  const modelSegmentDurationLimitSec = resolveVideoModelDurationLimitSec(videoModel)
  if (typeof modelSegmentDurationLimitSec === 'number') {
    validateSegmentDurationAgainstModelLimit({
      body,
      modelSegmentDurationLimitSec,
      videoModel,
    })
  }

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name: buildProjectName(body),
      description: body.description,
      segmentDuration: body.segmentDurationSec,
      episodeDuration: duration.episodeDurationSec,
      totalDuration: duration.totalDurationSec,
      episodeCount: body.episodeCount,
      videoModel,
      novelText: body.novelScript || null,
      globalContext: body.description,
    },
    select: {
      id: true,
      name: true,
      description: true,
      segmentDuration: true,
      episodeDuration: true,
      totalDuration: true,
      episodeCount: true,
      videoModel: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    project: {
      ...project,
      segmentDurationSec: project.segmentDuration,
      episodeDurationSec: project.episodeDuration,
      totalDurationSec: project.totalDuration,
      videoModel: project.videoModel,
    },
  })
})
