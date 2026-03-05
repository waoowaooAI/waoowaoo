import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

type TimelineClip = {
  id: string
  src: string
  durationInFrames: number
  trim?: {
    from: number
    to: number
  }
  metadata: {
    panelId: string
    storyboardId: string
    description?: string
  }
}

type TimelineProjectData = {
  id: string
  episodeId: string
  schemaVersion: '1.0'
  config: {
    fps: number
    width: number
    height: number
  }
  timeline: TimelineClip[]
  bgmTrack: Array<Record<string, unknown>>
}

const TIMELINE_SCHEMA = {
  schema: 'timeline_project',
  version: 'v2',
  trackModel: 'single_video_track',
} as const

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function parseTimelineClip(raw: unknown): TimelineClip | null {
  const payload = asObject(raw)
  if (!payload) return null

  const id = asOptionalString(payload.id)
  const src = asOptionalString(payload.src)
  const durationInFrames = payload.durationInFrames
  const metadata = asObject(payload.metadata)
  if (!id || !src || !isPositiveInteger(durationInFrames) || !metadata) return null

  const panelId = asOptionalString(metadata.panelId)
  const storyboardId = asOptionalString(metadata.storyboardId)
  if (!panelId || !storyboardId) return null

  const trimObject = asObject(payload.trim)
  let trim: TimelineClip['trim']
  if (trimObject) {
    const from = trimObject.from
    const to = trimObject.to
    if (
      typeof from !== 'number'
      || !Number.isInteger(from)
      || from < 0
      || typeof to !== 'number'
      || !Number.isInteger(to)
      || to <= from
    ) {
      return null
    }
    trim = { from, to }
  }

  const description = asOptionalString(metadata.description)

  return {
    id,
    src,
    durationInFrames,
    ...(trim ? { trim } : {}),
    metadata: {
      panelId,
      storyboardId,
      ...(description ? { description } : {}),
    },
  }
}

function parseProjectData(raw: unknown): TimelineProjectData {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData 必须是对象' })
  }

  const id = asOptionalString(payload.id)
  const episodeId = asOptionalString(payload.episodeId)
  if (!id || !episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.id 与 projectData.episodeId 不能为空' })
  }

  if (payload.schemaVersion !== '1.0') {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.schemaVersion 必须是 1.0' })
  }

  const config = asObject(payload.config)
  if (!config) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.config 必须是对象' })
  }

  const fps = config.fps
  const width = config.width
  const height = config.height
  if (!isPositiveInteger(fps) || !isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.config.fps/width/height 必须是正整数' })
  }

  if (!Array.isArray(payload.timeline)) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.timeline 必须是数组' })
  }

  const timeline = payload.timeline.map(parseTimelineClip)
  if (timeline.some((clip) => !clip)) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.timeline 存在非法 clip 项' })
  }

  if (!Array.isArray(payload.bgmTrack)) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectData.bgmTrack 必须是数组' })
  }

  return {
    id,
    episodeId,
    schemaVersion: '1.0',
    config: {
      fps,
      width,
      height,
    },
    timeline: timeline as TimelineClip[],
    bgmTrack: payload.bgmTrack.filter((item): item is Record<string, unknown> => {
      return !!item && typeof item === 'object' && !Array.isArray(item)
    }),
  }
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  if (!projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const timelineProject = await prisma.timelineProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      projectData: true,
      renderStatus: true,
      outputUrl: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    timelineSchema: TIMELINE_SCHEMA,
    timeline: timelineProject
      ? {
        id: timelineProject.id,
        projectData: timelineProject.projectData,
        renderStatus: timelineProject.renderStatus,
        outputUrl: timelineProject.outputUrl,
        updatedAt: timelineProject.updatedAt,
      }
      : null,
  })
})

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  if (!projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const bodyRaw = await request.json().catch(() => null)
  const body = asObject(bodyRaw)
  if (!body) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const projectData = parseProjectData(body.projectData)

  const saved = await prisma.timelineProject.upsert({
    where: { projectId },
    create: {
      projectId,
      projectData: projectData as unknown as Prisma.InputJsonValue,
      renderStatus: 'draft',
    },
    update: {
      projectData: projectData as unknown as Prisma.InputJsonValue,
      renderStatus: 'draft',
    },
    select: {
      id: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    timelineSchema: TIMELINE_SCHEMA,
    timeline: {
      id: saved.id,
      projectData,
      updatedAt: saved.updatedAt,
    },
  })
})
