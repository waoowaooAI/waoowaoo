import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { presentProjectData } from '../project-payload'

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      episodes: {
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
      },
      characters: {
        orderBy: { createdAt: 'asc' },
        include: {
          appearances: {
            orderBy: { appearanceIndex: 'asc' },
            select: {
              id: true,
              appearanceIndex: true,
              description: true,
              imageUrl: true,
              previousImageUrl: true,
            },
          },
        },
      },
      locations: {
        orderBy: { createdAt: 'asc' },
        include: {
          locationImages: {
            orderBy: { imageIndex: 'asc' },
            select: {
              id: true,
              imageIndex: true,
              description: true,
              imageUrl: true,
              isSelected: true,
            },
          },
        },
      },
    },
  })

  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  void prisma.project.update({
    where: { id: projectId },
    data: { lastAccessedAt: new Date() },
  }).catch(() => undefined)

  return NextResponse.json({
    ok: true,
    project: presentProjectData(project),
  })
})
