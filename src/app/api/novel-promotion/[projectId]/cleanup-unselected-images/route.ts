import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/storage'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

/**
 * POST - 清理未选中的图片
 * 在用户确认资产进入下一步时调用
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { novelData } = authResult

  let deletedCount = 0

  // 1. 清理角色形象的未选中图片
  const appearances = await prisma.characterAppearance.findMany({
    where: { character: { novelPromotionProjectId: novelData.id } },
    include: { character: true }
  })

  for (const appearance of appearances) {
    if (appearance.selectedIndex === null) continue

    try {
      const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
      if (imageUrls.length <= 1) continue

      // 删除未选中的图片
      for (let i = 0; i < imageUrls.length; i++) {
        if (i !== appearance.selectedIndex && imageUrls[i]) {
          try {
            const key = await resolveStorageKeyFromMediaValue(imageUrls[i]!)
            if (key) {
              await deleteObject(key)
              _ulogInfo(`✓ Deleted: ${key}`)
              deletedCount++
            }
          } catch { }
        }
      }

      // 只保留选中的图片
      const selectedUrl = imageUrls[appearance.selectedIndex]
      if (!selectedUrl) continue
      await prisma.characterAppearance.update({
        where: { id: appearance.id },
        data: {
          imageUrls: encodeImageUrls([selectedUrl]),
          selectedIndex: 0
        }
      })
    } catch { }
  }

  // 2. 清理场景的未选中图片
  const locations = await prisma.novelPromotionLocation.findMany({
    where: { novelPromotionProjectId: novelData.id },
    include: { images: true }
  })

  for (const location of locations) {
    const selectedImage = location.selectedImageId
      ? location.images.find(img => img.id === location.selectedImageId)
      : location.images.find(img => img.isSelected)
    if (!selectedImage) continue

    // 删除未选中的图片
    for (const img of location.images) {
      if (!img.isSelected && img.imageUrl) {
        try {
          const key = await resolveStorageKeyFromMediaValue(img.imageUrl)
          if (key) {
            await deleteObject(key)
            _ulogInfo(`✓ Deleted: ${key}`)
            deletedCount++
          }
        } catch { }

        // 删除图片记录
        await prisma.locationImage.delete({ where: { id: img.id } })
      }
    }

    // 重置选中图片的索引为0
    await prisma.locationImage.update({
      where: { id: selectedImage.id },
      data: { imageIndex: 0 }
    })

    await prisma.novelPromotionLocation.update({
      where: { id: location.id },
      data: { selectedImageId: selectedImage.id }
    })
  }

  return NextResponse.json({ success: true, deletedCount })
})
