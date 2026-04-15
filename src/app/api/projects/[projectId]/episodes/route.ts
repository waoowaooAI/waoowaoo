import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET - 获取项目的所有剧集
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { project } = authResult

  const episodes = await prisma.projectEpisode.findMany({
    where: { projectId: project.id },
    orderBy: { episodeNumber: 'asc' }
  })

  return NextResponse.json({ episodes })
})

/**
 * POST - 创建新剧集
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { project, projectData } = authResult

  const body = await request.json()
  const { name, description, novelText } = body

  if (!name || name.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取下一个剧集编号
  const lastEpisode = await prisma.projectEpisode.findFirst({
    where: { projectId: project.id },
    orderBy: { episodeNumber: 'desc' }
  })
  const nextEpisodeNumber = (lastEpisode?.episodeNumber || 0) + 1

  // 创建剧集
  const createData: Prisma.ProjectEpisodeUncheckedCreateInput = {
    projectId: project.id,
    episodeNumber: nextEpisodeNumber,
    name: name.trim(),
    description: description?.trim() || null,
  }
  if (typeof novelText === 'string') {
    createData.novelText = novelText
  }

  const episode = await prisma.projectEpisode.create({
    data: createData,
  })

  // 更新最后编辑的剧集ID
  await prisma.project.update({
    where: { id: project.id },
    data: { lastEpisodeId: episode.id }
  })

  return NextResponse.json({ episode }, { status: 201 })
})
