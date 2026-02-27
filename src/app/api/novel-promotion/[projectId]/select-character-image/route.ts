import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 选择角色形象的图片
 * 直接更新独立的 CharacterAppearance 表
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { characterId, appearanceId, selectedIndex } = await request.json()

  if (!characterId || !appearanceId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 使用 UUID 直接查询
  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: appearanceId },
    include: { character: true }
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  // 解析图片URLs
  const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')

  // 验证索引
  if (selectedIndex !== null) {
    if (selectedIndex < 0 || selectedIndex >= imageUrls.length || !imageUrls[selectedIndex]) {
      throw new ApiError('INVALID_PARAMS')
    }
  }

  const selectedImageKey = selectedIndex !== null ? imageUrls[selectedIndex] : null

  // 直接更新独立记录（无并发风险）
  await prisma.characterAppearance.update({
    where: { id: appearance.id },
    data: {
      selectedIndex: selectedIndex,
      imageUrl: selectedImageKey
    }
  })

  if (selectedIndex !== null) {
    _ulogInfo(`✓ 角色 ${appearance.character.name} 形象 ${appearanceId}: 选择了索引 ${selectedIndex}`)
  } else {
    _ulogInfo(`✓ 角色 ${appearance.character.name} 形象 ${appearanceId}: 取消选择`)
  }

  const signedUrl = selectedImageKey ? getSignedUrl(selectedImageKey, 7 * 24 * 3600) : null

  return NextResponse.json({
    success: true,
    selectedIndex,
    imageUrl: signedUrl
  })
})
