import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

type EpisodeInput = {
  name: string
  description?: string
  novelText?: string
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseEpisodes(value: unknown): EpisodeInput[] {
  if (!Array.isArray(value)) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodes 必须是数组' })
  }
  const episodes: EpisodeInput[] = []
  for (const item of value) {
    const row = asObject(item)
    if (!row) {
      throw new ApiError('INVALID_PARAMS', { message: 'episodes 存在非法项' })
    }
    const name = asOptionalString(row.name)
    if (!name) {
      throw new ApiError('INVALID_PARAMS', { message: 'episodes[*].name 不能为空' })
    }
    episodes.push({
      name,
      description: asOptionalString(row.description) || undefined,
      novelText: asOptionalString(row.novelText) || undefined,
    })
  }
  return episodes
}

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

  const episodes = parseEpisodes(body.episodes)
  const clearExisting = body.clearExisting === true

  const created = await prisma.$transaction(async (tx) => {
    if (clearExisting) {
      await tx.episode.deleteMany({ where: { projectId } })
    }

    const existingMax = await tx.episode.findFirst({
      where: { projectId },
      orderBy: { episodeIndex: 'desc' },
      select: { episodeIndex: true },
    })
    let nextIndex = (existingMax?.episodeIndex ?? -1) + 1
    const rows: Array<{
      id: string
      episodeIndex: number
      name: string | null
      novelText: string | null
      audioUrl: string | null
      srtContent: string | null
      createdAt: Date
    }> = []

    for (const episode of episodes) {
      const createdEpisode = await tx.episode.create({
        data: {
          projectId,
          episodeIndex: nextIndex,
          name: episode.name,
          novelText: episode.novelText || episode.description || null,
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
      rows.push(createdEpisode)
      nextIndex += 1
    }

    return rows
  })

  return NextResponse.json({
    ok: true,
    episodes: created.map((episode) => ({
      id: episode.id,
      episodeNumber: episode.episodeIndex + 1,
      name: episode.name || `第 ${episode.episodeIndex + 1} 集`,
      description: null,
      novelText: episode.novelText,
      audioUrl: episode.audioUrl,
      srtContent: episode.srtContent,
      createdAt: episode.createdAt,
    })),
  })
})
