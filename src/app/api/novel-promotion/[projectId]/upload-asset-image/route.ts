import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadObject, generateUniqueKey } from '@/lib/storage'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface CharacterAppearanceRecord {
  id: string
  imageUrls: string | null
  selectedIndex: number | null
}

interface LocationImageRecord {
  id: string
  imageIndex: number
}

interface LocationRecord {
  selectedImageId: string | null
  images?: LocationImageRecord[]
}

interface UploadAssetImageDb {
  characterAppearance: {
    findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  novelPromotionLocation: {
    findUnique(args: Record<string, unknown>): Promise<LocationRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  locationImage: {
    update(args: Record<string, unknown>): Promise<{ id: string }>
    create(args: Record<string, unknown>): Promise<{ id: string }>
  }
}

/**
 * POST /api/novel-promotion/[projectId]/upload-asset-image
 * 上传用户自定义图片作为角色或场景资产
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const db = prisma as unknown as UploadAssetImageDb

  // 初始化字体（在 Vercel 环境中需要）
  await initializeFonts()

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 解析表单数据
  const formData = await request.formData()
  const file = formData.get('file') as File
  const type = formData.get('type') as string // 'character' | 'location'
  const id = formData.get('id') as string // characterId 或 locationId
  const appearanceId = formData.get('appearanceId') as string | null  // UUID
  const imageIndex = formData.get('imageIndex') as string | null
  const labelText = formData.get('labelText') as string // 文字标识符

  if (!file || !type || !id || !labelText) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 读取文件
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 添加文字标识符
  const meta = await sharp(buffer).metadata()
  const w = meta.width || 2160
  const h = meta.height || 2160
  const fontSize = Math.floor(h * 0.04)
  const pad = Math.floor(fontSize * 0.5)
  const barH = fontSize + pad * 2

  // 创建SVG文字条
  const svg = await createLabelSVG(w, barH, fontSize, pad, labelText)

  // 添加文字条到图片顶部
  const processed = await sharp(buffer)
    .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()

  // 生成唯一key并上传
  const keyPrefix = type === 'character'
    ? `char-${id}-${appearanceId}-upload`
    : `loc-${id}-upload`
  const key = generateUniqueKey(keyPrefix, 'jpg')
  await uploadObject(processed, key)

  // 更新数据库
  if (type === 'character' && appearanceId !== null) {
    // 更新角色形象图片 - 使用 UUID 直接查询
    const appearance = await db.characterAppearance.findUnique({
      where: { id: appearanceId }
    })

    if (!appearance) {
      throw new ApiError('NOT_FOUND')
    }

    // 解析现有图片数组
    const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')

    // 如果指定了imageIndex，替换对应位置的图片
    const targetIndex = imageIndex !== null ? parseInt(imageIndex) : imageUrls.length

    // 确保数组足够大
    while (imageUrls.length <= targetIndex) {
      imageUrls.push('')
    }

    imageUrls[targetIndex] = key

    // 计算是否需要同步更新 imageUrl
    // 当上传的图片是选中的图片时，或者是第一张图片且没有选中任何图片时
    const selectedIndex = appearance.selectedIndex
    const shouldUpdateImageUrl =
      selectedIndex === targetIndex ||  // 上传的是选中的图片
      (selectedIndex === null && targetIndex === 0) ||  // 没有选中任何图片，上传的是第一张
      imageUrls.filter(u => !!u).length === 1  // 只有一张有效图片

    const updateData: Record<string, unknown> = {
      imageUrls: encodeImageUrls(imageUrls)
    }

    if (shouldUpdateImageUrl) {
      updateData.imageUrl = key
    }

    // 更新数据库
    await db.characterAppearance.update({
      where: { id: appearance.id },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      imageKey: key,
      imageIndex: targetIndex
    })

  } else if (type === 'location') {
    // 更新场景图片
    const location = await db.novelPromotionLocation.findUnique({
      where: { id },
      include: { images: { orderBy: { imageIndex: 'asc' } } }
    })

    if (!location) {
      throw new ApiError('NOT_FOUND')
    }

    // 如果指定了imageIndex，更新对应的图片记录
    if (imageIndex !== null) {
      const targetImageIndex = parseInt(imageIndex)
      const existingImage = location.images?.find((img) => img.imageIndex === targetImageIndex)

      if (existingImage) {
        const updated = await db.locationImage.update({
          where: { id: existingImage.id },
          data: { imageUrl: key }
        })
        if (!location.selectedImageId) {
          await prisma.novelPromotionLocation.update({
            where: { id },
            data: { selectedImageId: updated.id }
          })
        }
      } else {
        const created = await db.locationImage.create({
          data: {
            locationId: id,
            imageIndex: targetImageIndex,
            imageUrl: key,
            description: labelText,
            isSelected: targetImageIndex === 0
          }
        })
        if (!location.selectedImageId) {
          await prisma.novelPromotionLocation.update({
            where: { id },
            data: { selectedImageId: created.id }
          })
        }
      }

      return NextResponse.json({
        success: true,
        imageKey: key,
        imageIndex: targetImageIndex
      })
    } else {
      // 创建新的图片记录
      const maxIndex = location.images?.length || 0
      const created = await db.locationImage.create({
        data: {
          locationId: id,
          imageIndex: maxIndex,
          imageUrl: key,
          description: labelText,
          isSelected: maxIndex === 0
        }
      })
      if (!location.selectedImageId) {
        await prisma.novelPromotionLocation.update({
          where: { id },
          data: { selectedImageId: created.id }
        })
      }

      return NextResponse.json({
        success: true,
        imageKey: key,
        imageIndex: maxIndex
      })
    }
  }

  throw new ApiError('INVALID_PARAMS')
})
