import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

type UpdateStoryboardEntryBody = {
  startSec?: number
  endSec?: number
  description?: string
  dialogue?: string
  dialogueSpeaker?: string
  dialogueTone?: string
  soundEffect?: string
  shotType?: string
  cameraMove?: string
  imagePrompt?: string
  photographyNotes?: string
  actingNotes?: string
  characterRefs?: string[]
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return undefined
  return value
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  if (normalized.length !== value.length) {
    throw new ApiError('INVALID_PARAMS', { message: 'characterRefs 必须是非空字符串数组' })
  }

  return normalized
}

function parseBody(raw: unknown): UpdateStoryboardEntryBody {
  const payload = asObject(raw)
  if (!payload) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }

  const body: UpdateStoryboardEntryBody = {
    startSec: asOptionalNumber(payload.startSec),
    endSec: asOptionalNumber(payload.endSec),
    description: asOptionalString(payload.description),
    dialogue: asOptionalString(payload.dialogue),
    dialogueSpeaker: asOptionalString(payload.dialogueSpeaker),
    dialogueTone: asOptionalString(payload.dialogueTone),
    soundEffect: asOptionalString(payload.soundEffect),
    shotType: asOptionalString(payload.shotType),
    cameraMove: asOptionalString(payload.cameraMove),
    imagePrompt: asOptionalString(payload.imagePrompt),
    photographyNotes: asOptionalString(payload.photographyNotes),
    actingNotes: asOptionalString(payload.actingNotes),
    characterRefs: asOptionalStringArray(payload.characterRefs),
  }

  if (body.startSec !== undefined && body.startSec < 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'startSec 必须大于等于 0' })
  }
  if (body.endSec !== undefined && body.endSec <= 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'endSec 必须大于 0' })
  }

  const hasAnyField = Object.values(body).some((value) => value !== undefined)
  if (!hasAnyField) {
    throw new ApiError('INVALID_PARAMS', { message: '至少提供一个可更新字段' })
  }

  if (
    body.startSec !== undefined
    && body.endSec !== undefined
    && body.endSec <= body.startSec
  ) {
    throw new ApiError('INVALID_PARAMS', { message: 'endSec 必须大于 startSec' })
  }

  return body
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; entryId: string }> },
) => {
  const { projectId, entryId } = await context.params
  if (!projectId || !entryId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 与 entryId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = parseBody(await request.json())

  const existing = await prisma.storyboardEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      segment: {
        select: {
          episode: {
            select: {
              projectId: true,
            },
          },
        },
      },
    },
  })

  if (!existing || existing.segment.episode.projectId !== projectId) {
    throw new ApiError('NOT_FOUND', { message: '分镜条目不存在' })
  }

  const startTime = body.startSec ?? existing.startTime
  const endTime = body.endSec ?? existing.endTime
  if (endTime <= startTime) {
    throw new ApiError('INVALID_PARAMS', { message: 'endSec 必须大于 startSec' })
  }

  const updated = await prisma.storyboardEntry.update({
    where: { id: entryId },
    data: {
      ...(body.startSec !== undefined ? { startTime: body.startSec } : {}),
      ...(body.endSec !== undefined ? { endTime: body.endSec } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.dialogue !== undefined ? { dialogue: body.dialogue } : {}),
      ...(body.dialogueSpeaker !== undefined ? { dialogueSpeaker: body.dialogueSpeaker } : {}),
      ...(body.dialogueTone !== undefined ? { dialogueTone: body.dialogueTone } : {}),
      ...(body.soundEffect !== undefined ? { soundEffect: body.soundEffect } : {}),
      ...(body.shotType !== undefined ? { shotType: body.shotType } : {}),
      ...(body.cameraMove !== undefined ? { cameraMove: body.cameraMove } : {}),
      ...(body.imagePrompt !== undefined ? { imagePrompt: body.imagePrompt } : {}),
      ...(body.photographyNotes !== undefined ? { photographyNotes: body.photographyNotes } : {}),
      ...(body.actingNotes !== undefined ? { actingNotes: body.actingNotes } : {}),
      ...(body.characterRefs !== undefined ? { characterRefs: body.characterRefs } : {}),
    },
    select: {
      id: true,
      segmentId: true,
      entryIndex: true,
      startTime: true,
      endTime: true,
      description: true,
      dialogue: true,
      dialogueSpeaker: true,
      dialogueTone: true,
      soundEffect: true,
      shotType: true,
      cameraMove: true,
      imagePrompt: true,
      photographyNotes: true,
      actingNotes: true,
      characterRefs: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    entry: {
      id: updated.id,
      segmentId: updated.segmentId,
      entryIndex: updated.entryIndex,
      startSec: updated.startTime,
      endSec: updated.endTime,
      description: updated.description,
      dialogue: updated.dialogue,
      dialogueSpeaker: updated.dialogueSpeaker,
      dialogueTone: updated.dialogueTone,
      soundEffect: updated.soundEffect,
      shotType: updated.shotType,
      cameraMove: updated.cameraMove,
      imagePrompt: updated.imagePrompt,
      photographyNotes: updated.photographyNotes,
      actingNotes: updated.actingNotes,
      characterRefs: updated.characterRefs,
      updatedAt: updated.updatedAt,
    },
  })
})
