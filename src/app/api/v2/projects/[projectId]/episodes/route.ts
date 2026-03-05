import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function presentEpisode(episode: {
  id: string
  episodeIndex: number
  name: string | null
  novelText: string | null
  audioUrl: string | null
  srtContent: string | null
  createdAt: Date
}) {
  return {
    id: episode.id,
    episodeNumber: episode.episodeIndex + 1,
    name: episode.name || `第 ${episode.episodeIndex + 1} 集`,
    description: null,
    novelText: episode.novelText,
    audioUrl: episode.audioUrl,
    srtContent: episode.srtContent,
    createdAt: episode.createdAt,
  }
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodes = await prisma.episode.findMany({
    where: { projectId },
    orderBy: { episodeIndex: 'asc' },
    select: {
      id: true,
      episodeIndex: true,
      name: true,
      novelText: true,
      audioUrl: true,
      srtContent: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    episodes: episodes.map(presentEpisode),
  })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const raw = await request.json().catch(() => null)
  const body = asObject(raw)
  if (!body) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }
  const name = asOptionalString(body.name)
  if (!name) {
    throw new ApiError('INVALID_PARAMS', { message: 'name 不能为空' })
  }
  const description = asOptionalString(body.description)

  const lastEpisode = await prisma.episode.findFirst({
    where: { projectId },
    orderBy: { episodeIndex: 'desc' },
    select: { episodeIndex: true },
  })
  const nextEpisodeIndex = (lastEpisode?.episodeIndex ?? -1) + 1

  const episode = await prisma.episode.create({
    data: {
      projectId,
      episodeIndex: nextEpisodeIndex,
      name,
      novelText: description || null,
    },
    select: {
      id: true,
      episodeIndex: true,
      name: true,
      novelText: true,
      audioUrl: true,
      srtContent: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    episode: presentEpisode(episode),
  }, { status: 201 })
})
