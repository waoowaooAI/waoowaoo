import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// POST - 更新 panel 的首尾帧链接状态
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { storyboardId, panelIndex, linked } = body

  if (!storyboardId || panelIndex === undefined || linked === undefined) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 更新 panel 的链接状态
  await prisma.novelPromotionPanel.update({
    where: {
      storyboardId_panelIndex: {
        storyboardId,
        panelIndex
      }
    },
    data: {
      linkedToNextPanel: linked
    }
  })

  return NextResponse.json({ success: true })
})
