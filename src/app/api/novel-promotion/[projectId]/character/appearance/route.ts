import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteCOSObject } from '@/lib/cos'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 为现有角色添加子形象
 * Body: { characterId, changeReason, description }
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
  const { characterId, changeReason, description } = body

  if (!characterId || !changeReason || !description) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 验证角色存在
  const character = await prisma.novelPromotionCharacter.findUnique({
    where: { id: characterId },
    include: {
      appearances: { orderBy: { appearanceIndex: 'asc' } },
      novelPromotionProject: true
    }
  })

  if (!character) {
    throw new ApiError('NOT_FOUND')
  }

  // 验证角色属于当前项目
  if (character.novelPromotionProject.projectId !== projectId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 计算新的 appearanceIndex
  const maxIndex = character.appearances.reduce(
    (max, app) => Math.max(max, app.appearanceIndex),
    0
  )
  const newIndex = maxIndex + 1

  // 创建子形象
  const newAppearance = await prisma.characterAppearance.create({
    data: {
      characterId,
      appearanceIndex: newIndex,
      changeReason: changeReason.trim(),
      description: description.trim(),
      descriptions: JSON.stringify([description.trim()]),
      imageUrls: encodeImageUrls([]),
      previousImageUrls: encodeImageUrls([])}
  })

  _ulogInfo(`✓ 添加子形象: ${character.name} - ${changeReason} (index: ${newIndex})`)

  return NextResponse.json({
    success: true,
    appearance: newAppearance
  })
})

/**
 * PATCH - 更新角色形象描述
 * Body: { characterId, appearanceId, description, descriptionIndex }
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { characterId, appearanceId, description, descriptionIndex } = body

  if (!characterId || !appearanceId || !description) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 验证形象存在
  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: appearanceId },
    include: { character: { include: { novelPromotionProject: true } } }
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  if (appearance.characterId !== characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 验证角色属于当前项目
  if (appearance.character.novelPromotionProject.projectId !== projectId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 更新描述
  const trimmedDesc = description.trim()

  // 更新 descriptions 数组
  let descriptions: string[] = []
  try {
    descriptions = appearance.descriptions ? JSON.parse(appearance.descriptions) : []
  } catch {
    descriptions = []
  }

  // 如果指定了 descriptionIndex，更新对应位置；否则更新/添加第一个
  const idx = typeof descriptionIndex === 'number' ? descriptionIndex : 0
  if (idx >= 0 && idx < descriptions.length) {
    descriptions[idx] = trimmedDesc
  } else {
    descriptions.push(trimmedDesc)
  }

  await prisma.characterAppearance.update({
    where: { id: appearanceId },
    data: {
      description: trimmedDesc,
      descriptions: JSON.stringify(descriptions)
    }
  })

  _ulogInfo(`✓ 更新形象描述: ${appearance.character.name} - ${appearance.changeReason || '形象' + appearance.appearanceIndex}`)

  return NextResponse.json({
    success: true
  })
})

/**
 * DELETE - 删除单个角色形象
 * Query params: characterId, appearanceId
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const characterId = searchParams.get('characterId')
  const appearanceId = searchParams.get('appearanceId')

  if (!characterId || !appearanceId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取形象记录
  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: appearanceId },
    include: { character: true }
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  if (appearance.characterId !== characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 检查是否是最后一个形象
  const appearanceCount = await prisma.characterAppearance.count({
    where: { characterId }
  })

  if (appearanceCount <= 1) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 删除 COS 中的图片
  const deletedImages: string[] = []

  // 删除主图片
  if (appearance.imageUrl) {
    const key = await resolveStorageKeyFromMediaValue(appearance.imageUrl)
    if (key) {
      try {
        await deleteCOSObject(key)
        deletedImages.push(key)
      } catch {
        _ulogWarn('Failed to delete COS image:', key)
      }
    }
  }

  // 删除图片数组中的所有图片
  try {
    const urls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
    for (const url of urls) {
      if (url) {
        const key = await resolveStorageKeyFromMediaValue(url)
        if (key && !deletedImages.includes(key)) {
          try {
            await deleteCOSObject(key)
            deletedImages.push(key)
          } catch {
            _ulogWarn('Failed to delete COS image:', key)
          }
        }
      }
    }
  } catch {
    // contract violation is surfaced by migration/validation scripts; keep delete idempotent
  }

  // 删除数据库记录
  await prisma.characterAppearance.delete({
    where: { id: appearanceId }
  })

  // 重新排序剩余形象的 appearanceIndex
  const remainingAppearances = await prisma.characterAppearance.findMany({
    where: { characterId },
    orderBy: { appearanceIndex: 'asc' }
  })

  for (let i = 0; i < remainingAppearances.length; i++) {
    if (remainingAppearances[i].appearanceIndex !== i) {
      await prisma.characterAppearance.update({
        where: { id: remainingAppearances[i].id },
        data: { appearanceIndex: i }
      })
    }
  }

  _ulogInfo(`✓ 删除形象: ${appearance.character.name} - ${appearance.changeReason || '形象' + appearance.appearanceIndex}`)
  _ulogInfo(`✓ 删除了 ${deletedImages.length} 张 COS 图片`)

  return NextResponse.json({
    success: true,
    deletedImages: deletedImages.length
  })
})
