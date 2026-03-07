import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix, isArtStyleValue, type ArtStyleValue } from '@/lib/constants'
import { requireProjectAuth, requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// 删除场景（级联删除关联的图片记录）
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const locationId = searchParams.get('id')

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 删除场景（LocationImage 会级联删除）
  await prisma.novelPromotionLocation.delete({
    where: { id: locationId }
  })

  return NextResponse.json({ success: true })
})

// 新增场景
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { novelData } = authResult

  const rawBody = await request.json().catch(() => ({}))
  const body = toObject(rawBody)
  const name = normalizeString(body.name)
  const description = normalizeString(body.description)
  const summary = normalizeString(body.summary)
  const count = normalizeImageGenerationCount('location', body.count)
  let artStyle: ArtStyleValue | undefined
  if (Object.prototype.hasOwnProperty.call(body, 'artStyle')) {
    const parsedArtStyle = normalizeString(body.artStyle)
    if (!isArtStyleValue(parsedArtStyle)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'INVALID_ART_STYLE',
        message: 'artStyle must be a supported value',
      })
    }
    artStyle = parsedArtStyle
  }

  if (!name || !description) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 创建场景
  const cleanDescription = removeLocationPromptSuffix(description.trim())
  const location = await prisma.novelPromotionLocation.create({
    data: {
      novelPromotionProjectId: novelData.id,
      name: name.trim(),
      summary: summary || null
    }
  })

  // 创建初始图片记录
  await prisma.locationImage.createMany({
    data: Array.from({ length: count }, (_value, imageIndex) => ({
      locationId: location.id,
      imageIndex,
      description: cleanDescription,
    })),
  })

  // 返回包含图片的场景数据
  const locationWithImages = await prisma.novelPromotionLocation.findUnique({
    where: { id: location.id },
    include: { images: true }
  })

  return NextResponse.json({ success: true, location: locationWithImages })
})

// 更新场景（名字或图片描述）
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { locationId, imageIndex, description, name } = body

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 如果提供了 name 或 summary，更新场景信息
  if (name !== undefined || body.summary !== undefined) {
    const updateData: { name?: string; summary?: string | null } = {}
    if (name !== undefined) updateData.name = name.trim()
    if (body.summary !== undefined) updateData.summary = body.summary?.trim() || null

    const location = await prisma.novelPromotionLocation.update({
      where: { id: locationId },
      data: updateData
    })
    return NextResponse.json({ success: true, location })
  }

  // 如果提供了 description 和 imageIndex，更新图片描述
  if (imageIndex !== undefined && description) {
    const cleanDescription = removeLocationPromptSuffix(description.trim())
    const image = await prisma.locationImage.update({
      where: {
        locationId_imageIndex: { locationId, imageIndex }
      },
      data: { description: cleanDescription }
    })
    return NextResponse.json({ success: true, image })
  }

  throw new ApiError('INVALID_PARAMS')
})
