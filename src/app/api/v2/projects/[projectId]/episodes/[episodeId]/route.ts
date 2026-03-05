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

async function requireEpisode(projectId: string, episodeId: string) {
  const episode = await prisma.episode.findFirst({
    where: {
      id: episodeId,
      projectId,
    },
    select: {
      id: true,
      episodeIndex: true,
      name: true,
      novelText: true,
      audioUrl: true,
      srtContent: true,
      createdAt: true,
      segments: {
        orderBy: { segmentIndex: 'asc' },
        select: {
          id: true,
          segmentIndex: true,
          summary: true,
          content: true,
          screenplay: true,
          startTime: true,
          endTime: true,
          storyboardEntries: {
            orderBy: { entryIndex: 'asc' },
            select: {
              id: true,
              entryIndex: true,
              startTime: true,
              endTime: true,
              description: true,
              dialogue: true,
              dialogueTone: true,
              soundEffect: true,
              shotType: true,
              cameraMove: true,
              imageUrl: true,
            },
          },
        },
      },
      voiceLines: {
        orderBy: { lineIndex: 'asc' },
        select: {
          id: true,
          lineIndex: true,
          speaker: true,
          content: true,
          audioUrl: true,
        },
      },
    },
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: '剧集不存在' })
  }
  return episode
}

function presentEpisode(episode: Awaited<ReturnType<typeof requireEpisode>>) {
  return {
    id: episode.id,
    episodeNumber: episode.episodeIndex + 1,
    name: episode.name || `第 ${episode.episodeIndex + 1} 集`,
    description: null,
    novelText: episode.novelText,
    audioUrl: episode.audioUrl,
    srtContent: episode.srtContent,
    createdAt: episode.createdAt,
    clips: episode.segments.map((segment) => ({
      id: segment.id,
      clipIndex: segment.segmentIndex,
      summary: segment.summary,
      content: segment.content,
      screenplay: segment.screenplay,
      startTime: segment.startTime,
      endTime: segment.endTime,
    })),
    storyboards: episode.segments.map((segment) => ({
      id: segment.id,
      clipId: segment.id,
      panelCount: segment.storyboardEntries.length,
      panels: segment.storyboardEntries.map((entry) => ({
        id: entry.id,
        panelIndex: entry.entryIndex,
        startTime: entry.startTime,
        endTime: entry.endTime,
        description: entry.description,
        dialogue: entry.dialogue,
        dialogueTone: entry.dialogueTone,
        soundEffect: entry.soundEffect,
        shotType: entry.shotType,
        cameraMove: entry.cameraMove,
        imageUrl: entry.imageUrl,
      })),
    })),
    voiceLines: episode.voiceLines.map((line) => ({
      id: line.id,
      lineIndex: line.lineIndex,
      text: line.content,
      speaker: line.speaker,
      audioUrl: line.audioUrl,
    })),
  }
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> },
) => {
  const { projectId, episodeId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episode = await requireEpisode(projectId, episodeId)
  return NextResponse.json({
    ok: true,
    episode: presentEpisode(episode),
  })
})

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> },
) => {
  const { projectId, episodeId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const raw = await request.json().catch(() => null)
  const body = asObject(raw)
  if (!body) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const data: {
    name?: string | null
    novelText?: string | null
    audioUrl?: string | null
    srtContent?: string | null
  } = {}
  if (body.name !== undefined) data.name = asOptionalString(body.name)
  if (body.novelText !== undefined) data.novelText = asOptionalString(body.novelText)
  if (body.audioUrl !== undefined) data.audioUrl = asOptionalString(body.audioUrl)
  if (body.srtContent !== undefined) data.srtContent = asOptionalString(body.srtContent)

  if (
    data.name === undefined
    && data.novelText === undefined
    && data.audioUrl === undefined
    && data.srtContent === undefined
  ) {
    throw new ApiError('INVALID_PARAMS', { message: '无可更新字段' })
  }

  const updated = await prisma.episode.updateMany({
    where: { id: episodeId, projectId },
    data,
  })
  if (updated.count <= 0) {
    throw new ApiError('NOT_FOUND', { message: '剧集不存在' })
  }

  const episode = await requireEpisode(projectId, episodeId)
  return NextResponse.json({
    ok: true,
    episode: presentEpisode(episode),
  })
})

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> },
) => {
  const { projectId, episodeId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const deleted = await prisma.episode.deleteMany({
    where: { id: episodeId, projectId },
  })
  if (deleted.count <= 0) {
    throw new ApiError('NOT_FOUND', { message: '剧集不存在' })
  }

  return NextResponse.json({
    ok: true,
    episodeId,
  })
})
