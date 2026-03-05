import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const GET = apiHandler(async (_request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const locations = await prisma.location.findMany({
    where: {
      project: {
        userId: session.user.id,
      },
    },
    orderBy: { createdAt: 'desc' },
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
  })

  return NextResponse.json({
    ok: true,
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      summary: location.summary,
      folderId: null,
      images: (location.locationImages || []).map((image) => ({
        id: image.id,
        imageIndex: image.imageIndex,
        description: image.description,
        imageUrl: image.imageUrl,
        previousImageUrl: null,
        isSelected: image.isSelected,
        imageTaskRunning: false,
        lastError: null,
      })),
    })),
  })
})
