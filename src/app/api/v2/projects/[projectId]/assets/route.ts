import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { presentCharacters, presentLocations } from '../project-payload'

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

  return NextResponse.json({
    ok: true,
    characters: presentCharacters(project.characters),
    locations: presentLocations(project.locations),
  })
})
