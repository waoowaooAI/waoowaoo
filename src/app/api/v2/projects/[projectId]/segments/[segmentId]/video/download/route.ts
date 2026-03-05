import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function buildDownloadName(segmentIndex: number) {
  const safeIndex = Number.isFinite(segmentIndex) ? segmentIndex : 0
  return `segment-${safeIndex + 1}.mp4`
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; segmentId: string }> },
) => {
  const { projectId, segmentId } = await context.params
  if (!projectId || !segmentId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 与 segmentId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const segment = await prisma.segment.findFirst({
    where: {
      id: segmentId,
      episode: {
        projectId,
      },
    },
    select: {
      id: true,
      segmentIndex: true,
      segmentVideo: {
        select: {
          videoUrl: true,
          status: true,
          modelKey: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!segment) {
    throw new ApiError('NOT_FOUND', { message: '片段不存在' })
  }

  const videoUrl = segment.segmentVideo?.videoUrl
  if (!videoUrl) {
    throw new ApiError('NOT_FOUND', { message: '片段视频不存在' })
  }

  return NextResponse.json({
    ok: true,
    download: {
      segmentId: segment.id,
      fileName: buildDownloadName(segment.segmentIndex),
      videoUrl,
      status: segment.segmentVideo?.status || 'ready',
      modelKey: segment.segmentVideo?.modelKey || null,
      updatedAt: segment.segmentVideo?.updatedAt || null,
    },
  })
})
