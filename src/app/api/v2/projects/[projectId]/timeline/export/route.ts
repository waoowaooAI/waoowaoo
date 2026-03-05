import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const TIMELINE_EXPORT_SCHEMA = {
  schema: 'timeline_export',
  version: 'v2',
  strategy: 'mvp_passthrough_first_clip',
} as const

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function collectTimelineUrls(projectData: unknown): string[] {
  const data = asObject(projectData)
  if (!data) return []
  const timeline = Array.isArray(data.timeline) ? data.timeline : []

  const urls: string[] = []
  for (const item of timeline) {
    const row = asObject(item)
    if (!row) continue
    const src = row.src
    if (typeof src === 'string' && src.trim().length > 0) {
      urls.push(src.trim())
    }
  }
  return urls
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

  const body = asObject(await request.json().catch(() => ({})))
  const editorProjectId = body && typeof body.editorProjectId === 'string' ? body.editorProjectId.trim() : ''
  if (!editorProjectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'editorProjectId 不能为空' })
  }

  const timelineProject = await prisma.timelineProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      projectData: true,
      outputUrl: true,
    },
  })
  if (!timelineProject) {
    throw new ApiError('NOT_FOUND', { message: '时间轴项目不存在' })
  }

  const outputUrl = typeof timelineProject.outputUrl === 'string' && timelineProject.outputUrl.trim().length > 0
    ? timelineProject.outputUrl.trim()
    : collectTimelineUrls(timelineProject.projectData)[0]

  if (!outputUrl) {
    throw new ApiError('NOT_FOUND', { message: '暂无可导出视频' })
  }

  const updated = await prisma.timelineProject.update({
    where: { id: timelineProject.id },
    data: {
      renderStatus: 'completed',
      outputUrl,
    },
    select: {
      id: true,
      renderStatus: true,
      outputUrl: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    exportSchema: TIMELINE_EXPORT_SCHEMA,
    render: {
      id: updated.id,
      status: updated.renderStatus,
      outputUrl: updated.outputUrl,
      updatedAt: updated.updatedAt,
      strategy: TIMELINE_EXPORT_SCHEMA.strategy,
    },
  })
})

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  if (!projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const renderId = request.nextUrl.searchParams.get('id') || ''
  if (!renderId.trim()) {
    throw new ApiError('INVALID_PARAMS', { message: 'id 不能为空' })
  }

  const timelineProject = await prisma.timelineProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      renderStatus: true,
      outputUrl: true,
      updatedAt: true,
    },
  })

  if (!timelineProject || timelineProject.id !== renderId.trim()) {
    throw new ApiError('NOT_FOUND', { message: '导出任务不存在' })
  }

  return NextResponse.json({
    ok: true,
    exportSchema: TIMELINE_EXPORT_SCHEMA,
    render: {
      id: timelineProject.id,
      status: timelineProject.renderStatus || 'pending',
      outputUrl: timelineProject.outputUrl,
      updatedAt: timelineProject.updatedAt,
    },
  })
})
