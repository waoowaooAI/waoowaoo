import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'

/**
 * GET - 获取单个剧集的完整数据
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 获取剧集及其关联数据
  const episode = await prisma.projectEpisode.findUnique({
    where: { id: episodeId },
    include: {
      clips: {
        orderBy: { createdAt: 'asc' }
      },
      storyboards: {
        include: {
          clip: true,
          panels: { orderBy: { panelIndex: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
      },
      shots: {
        orderBy: { shotId: 'asc' }
      },
      voiceLines: {
        orderBy: { lineIndex: 'asc' }
      }
    }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  // 更新最后编辑的剧集ID（异步，不阻塞响应）
  prisma.project.update({
    where: { id: projectId },
    data: { lastEpisodeId: episodeId }
  }).catch(err => _ulogError('更新 lastEpisodeId 失败:', err))

  // 转换为稳定媒体 URL（并保留兼容字段）
  const episodeWithSignedUrls = await attachMediaFieldsToProject(episode)

  return NextResponse.json({ episode: episodeWithSignedUrls })
})

/**
 * PATCH - 更新剧集信息
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { name, description, novelText, audioUrl, srtContent } = body

  const updateData: Prisma.ProjectEpisodeUncheckedUpdateInput = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (novelText !== undefined) updateData.novelText = novelText
  if (audioUrl !== undefined) {
    updateData.audioUrl = audioUrl
    const media = await resolveMediaRefFromLegacyValue(audioUrl)
    updateData.audioMediaId = media?.id || null
  }
  if (srtContent !== undefined) updateData.srtContent = srtContent

  const episode = await prisma.projectEpisode.update({
    where: { id: episodeId },
    data: updateData
  })

  return NextResponse.json({ episode })
})

/**
 * DELETE - 删除剧集
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 删除剧集（关联数据会级联删除）
  await prisma.projectEpisode.delete({
    where: { id: episodeId }
  })

  // 如果删除的是最后编辑的剧集，更新 lastEpisodeId
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { lastEpisodeId: true },
  })

  if (project?.lastEpisodeId === episodeId) {
    // 找到另一个剧集作为默认
    const anotherEpisode = await prisma.projectEpisode.findFirst({
      where: { projectId },
      orderBy: { episodeNumber: 'asc' }
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { lastEpisodeId: anotherEpisode?.id || null }
    })
  }

  return NextResponse.json({ success: true })
})
