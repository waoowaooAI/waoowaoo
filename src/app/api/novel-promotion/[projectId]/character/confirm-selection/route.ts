import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/storage'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 确认选择并删除未选中的候选图片
 * Body: { characterId, appearanceId }
 * 
 * 工作流程：
 * 1. 验证已经选择了一张图片（selectedIndex 不为 null）
 * 2. 删除 imageUrls 中未选中的图片（从 COS 和数据库）
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
  const { characterId, appearanceId } = body

  if (!characterId || !appearanceId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取形象记录 - 使用 UUID 直接查询
  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: appearanceId },
    include: { character: true }
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  // 检查是否已选择
  if (appearance.selectedIndex === null || appearance.selectedIndex === undefined) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 解析图片数组
  const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')

  if (imageUrls.length <= 1) {
    // 已经只有一张图片，无需操作
    return NextResponse.json({
      success: true,
      message: '已确认选择',
      deletedCount: 0
    })
  }

  const selectedIndex = appearance.selectedIndex
  const selectedImageUrl = imageUrls[selectedIndex]

  if (!selectedImageUrl) {
    throw new ApiError('NOT_FOUND')
  }

  // 删除未选中的图片
  const deletedImages: string[] = []
  for (let i = 0; i < imageUrls.length; i++) {
    if (i !== selectedIndex && imageUrls[i]) {
      const key = await resolveStorageKeyFromMediaValue(imageUrls[i]!)
      if (key) {
        try {
          await deleteObject(key)
          deletedImages.push(key)
        } catch {
          _ulogWarn('Failed to delete COS image:', key)
        }
      }
    }
  }

  // 同样处理 descriptions，只保留选中的描述
  let descriptions: string[] = []
  if (appearance.descriptions) {
    try {
      descriptions = JSON.parse(appearance.descriptions)
    } catch { }
  }
  const selectedDescription = descriptions[selectedIndex] || appearance.description || ''

  // 更新数据库：只保留选中的图片
  await prisma.characterAppearance.update({
    where: { id: appearance.id },
    data: {
      imageUrl: selectedImageUrl,
      imageUrls: encodeImageUrls([selectedImageUrl]),  // 只保留选中的图片
      selectedIndex: 0,  // 现在只有一张，索引为0
      description: selectedDescription,
      descriptions: JSON.stringify([selectedDescription])
    }
  })

  _ulogInfo(`✓ 确认选择: ${appearance.character.name} - ${appearance.changeReason}`)
  _ulogInfo(`✓ 删除了 ${deletedImages.length} 张未选中的图片`)

  return NextResponse.json({
    success: true,
    message: '已确认选择，其他候选图片已删除',
    deletedCount: deletedImages.length
  })
})
