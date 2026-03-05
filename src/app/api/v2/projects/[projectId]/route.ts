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

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      segmentDuration: true,
      episodeDuration: true,
      totalDuration: true,
      episodeCount: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  return NextResponse.json({
    ok: true,
    project: {
      ...project,
      segmentDurationSec: project.segmentDuration,
      episodeDurationSec: project.episodeDuration,
      totalDurationSec: project.totalDuration,
    },
  })
})

export const PATCH = apiHandler(async (
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

  const parsedName = body.name === undefined ? undefined : asOptionalString(body.name)
  if (body.name !== undefined && !parsedName) {
    throw new ApiError('INVALID_PARAMS', { message: 'name 不能为空' })
  }
  if (parsedName && parsedName.length > 100) {
    throw new ApiError('INVALID_PARAMS', { message: 'name 长度不能超过 100' })
  }

  const description = body.description === undefined
    ? undefined
    : (typeof body.description === 'string' ? body.description.trim() : null)
  if (body.description !== undefined && description === null) {
    throw new ApiError('INVALID_PARAMS', { message: 'description 必须是字符串' })
  }
  if (typeof description === 'string' && description.length > 2_000) {
    throw new ApiError('INVALID_PARAMS', { message: 'description 长度不能超过 2000' })
  }

  if (parsedName === undefined && description === undefined) {
    throw new ApiError('INVALID_PARAMS', { message: '至少提供 name 或 description 之一' })
  }

  const updateData: {
    name?: string
    description?: string | null
  } = {}
  if (parsedName !== undefined && parsedName !== null) {
    updateData.name = parsedName
  }
  if (description !== undefined) {
    updateData.description = description || null
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: updateData,
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    project,
  })
})

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  await prisma.project.delete({
    where: { id: projectId },
  })

  return NextResponse.json({
    ok: true,
    projectId,
  })
})
