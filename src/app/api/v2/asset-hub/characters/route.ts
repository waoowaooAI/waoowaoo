import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const GET = apiHandler(async (_request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const characters = await prisma.character.findMany({
    where: {
      project: {
        userId: session.user.id,
      },
    },
    orderBy: { createdAt: 'desc' },
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
  })

  return NextResponse.json({
    ok: true,
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      folderId: null,
      customVoiceUrl: null,
      appearances: (character.appearances || []).map((appearance) => ({
        id: appearance.id,
        appearanceIndex: appearance.appearanceIndex,
        changeReason: `形象 ${appearance.appearanceIndex + 1}`,
        description: appearance.description,
        descriptionSource: null,
        imageUrl: appearance.imageUrl,
        imageUrls: appearance.imageUrl ? [appearance.imageUrl] : [],
        selectedIndex: appearance.imageUrl ? 0 : null,
        previousImageUrl: appearance.previousImageUrl,
        previousImageUrls: appearance.previousImageUrl ? [appearance.previousImageUrl] : [],
        imageTaskRunning: false,
        lastError: null,
      })),
    })),
  })
})
