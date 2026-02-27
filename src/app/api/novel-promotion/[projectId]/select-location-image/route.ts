import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 选择场景图片
 * 直接更新独立的 LocationImage 表
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { locationId, selectedIndex } = await request.json()

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取场景和所有图片
  const location = await prisma.novelPromotionLocation.findUnique({
    where: { id: locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } }
  })

  if (!location) {
    throw new ApiError('NOT_FOUND')
  }

  // 验证索引
  if (selectedIndex !== null) {
    const targetImage = location.images.find(img => img.imageIndex === selectedIndex)
    if (!targetImage || !targetImage.imageUrl) {
      throw new ApiError('INVALID_PARAMS')
    }
  }

  // 先取消所有选中状态（兼容旧字段）
  await prisma.locationImage.updateMany({
    where: { locationId },
    data: { isSelected: false }
  })

  // 选中指定的图片
  let signedUrl: string | null = null
  if (selectedIndex !== null) {
    const updated = await prisma.locationImage.update({
      where: { locationId_imageIndex: { locationId, imageIndex: selectedIndex } },
      data: { isSelected: true }
    })
    signedUrl = updated.imageUrl ? getSignedUrl(updated.imageUrl, 7 * 24 * 3600) : null
    await prisma.novelPromotionLocation.update({
      where: { id: locationId },
      data: { selectedImageId: updated.id }
    })
    _ulogInfo(`✓ 场景 ${location.name}: 选择了索引 ${selectedIndex}`)
  } else {
    await prisma.novelPromotionLocation.update({
      where: { id: locationId },
      data: { selectedImageId: null }
    })
    _ulogInfo(`✓ 场景 ${location.name}: 取消选择`)
  }

  return NextResponse.json({
    success: true,
    selectedIndex,
    imageUrl: signedUrl
  })
})
