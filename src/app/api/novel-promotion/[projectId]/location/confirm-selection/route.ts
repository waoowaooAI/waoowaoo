import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteCOSObject } from '@/lib/cos'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 确认场景选择并删除未选中的候选图片
 * Body: { locationId }
 * 
 * 工作流程：
 * 1. 验证已经选择了一张图片（有 isSelected 的图片）
 * 2. 删除其他未选中的图片（从 COS 和数据库）
 * 3. 将选中的图片设为唯一图片
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { locationId } = body

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取场景及其图片
  const location = await prisma.novelPromotionLocation.findUnique({
    where: { id: locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } }
  })

  if (!location) {
    throw new ApiError('NOT_FOUND')
  }

  const images = location.images || []

  if (images.length <= 1) {
    // 已经只有一张图片，无需操作
    return NextResponse.json({
      success: true,
      message: '已确认选择',
      deletedCount: 0
    })
  }

  // 找到选中的图片
  const selectedImage = location.selectedImageId
    ? images.find((img) => img.id === location.selectedImageId)
    : images.find((img) => img.isSelected)
  if (!selectedImage) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 删除未选中的图片
  const deletedImages: string[] = []
  const imagesToDelete = images.filter((img) => img.id !== selectedImage.id)

  for (const img of imagesToDelete) {
    if (img.imageUrl) {
      const key = await resolveStorageKeyFromMediaValue(img.imageUrl)
      if (key) {
        try {
          await deleteCOSObject(key)
          deletedImages.push(key)
        } catch {
          _ulogWarn('Failed to delete COS image:', key)
        }
      }
    }
  }

  // 在事务中更新数据库
  await prisma.$transaction(async (tx) => {
    // 删除未选中的图片记录（排除选中的图片 ID）
    await tx.locationImage.deleteMany({
      where: {
        locationId,
        id: { not: selectedImage.id }
      }
    })

    // 更新选中图片的索引为 0
    await tx.locationImage.update({
      where: { id: selectedImage.id },
      data: { imageIndex: 0 }
    })

    await tx.novelPromotionLocation.update({
      where: { id: locationId },
      data: { selectedImageId: selectedImage.id }
    })
  })

  _ulogInfo(`✓ 场景确认选择: ${location.name}`)
  _ulogInfo(`✓ 删除了 ${deletedImages.length} 张未选中的图片`)

  return NextResponse.json({
    success: true,
    message: '已确认选择，其他候选图片已删除',
    deletedCount: deletedImages.length
  })
})
