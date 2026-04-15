import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { toMoneyNumber } from '@/lib/billing/money'
import { isArtStyleValue } from '@/lib/constants'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import {
  formatProjectValidationIssue,
  normalizeProjectDraft,
  validateProjectDraft,
  type ProjectDraftInput,
} from '@/lib/projects/validation'

function readProjectDraftBody(body: unknown): ProjectDraftInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { name: '' }
  }

  const payload = body as Record<string, unknown>
  return {
    name: typeof payload.name === 'string' ? payload.name : '',
    description: typeof payload.description === 'string' ? payload.description : null,
  }
}

// GET - 获取用户的项目（支持分页和搜索）
export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 获取查询参数
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '12', 10)
  const search = searchParams.get('search') || ''

  // 构建查询条件
  const where: Record<string, unknown> = { userId: session.user.id }

  // 如果有搜索关键词，搜索名称和描述
  // 注意：SQLite 不支持 mode: 'insensitive'，但 SQLite 的 LIKE 默认即大小写不敏感（ASCII 范围）
  if (search.trim()) {
    where.OR = [
      { name: { contains: search.trim() } },
      { description: { contains: search.trim() } }
    ]
  }

  // ⚡ 并行执行：获取总数 + 分页数据
  // 排序优先级：最近访问时间（有值的优先） > 更新时间
  const [total, allProjects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },  // 先按更新时间排序获取所有匹配项目
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  // 在应用层重新排序：
  // 1. 新创建但未访问过的项目（无 lastAccessedAt）按创建时间降序排在最前
  // 2. 访问过的项目按访问时间降序
  const projects = [...allProjects].sort((a, b) => {
    // 两个都没有访问时间，按创建时间降序（新创建的排前面）
    if (!a.lastAccessedAt && !b.lastAccessedAt) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    // 只有 a 没有访问时间（新创建），a 排前面
    if (!a.lastAccessedAt && b.lastAccessedAt) return -1
    // 只有 b 没有访问时间（新创建），b 排前面
    if (a.lastAccessedAt && !b.lastAccessedAt) return 1
    // 两个都有访问时间，按访问时间降序
    return new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime()
  })

  // 获取项目 ID 列表
  const projectIds = projects.map(p => p.id)

  // ⚡ 并行获取：费用 + 项目统计（章节数、图片数、视频数）
  const [costsByProject, projectEpisodes] = await Promise.all([
    // 一次性获取所有项目的费用（代替 N+1 查询）
    prisma.usageCost.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds } },
      _sum: { cost: true }
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          select: {
            episodeNumber: true,
            novelText: true,
            storyboards: {
              select: {
                _count: {
                  select: { panels: true }
                },
                panels: {
                  where: {
                    OR: [
                      { imageUrl: { not: null } },
                      { videoUrl: { not: null } },
                    ]
                  },
                  select: {
                    imageUrl: true,
                    videoUrl: true
                  }
                }
              }
            }
          }
        }
      }
    })
  ])

  // 构建费用映射表
  const costMap = new Map(
    costsByProject.map(item => [item.projectId, toMoneyNumber(item._sum.cost)])
  )

  // 构建统计映射表 + 第一集预览
  const statsMap = new Map<string, { episodes: number; images: number; videos: number; panels: number; firstEpisodePreview: string | null }>(
    projectEpisodes.map(projectEntry => {
      let imageCount = 0
      let videoCount = 0
      let panelCount = 0
      for (const ep of projectEntry.episodes) {
        for (const sb of ep.storyboards) {
          panelCount += sb._count.panels
          for (const panel of sb.panels) {
            if (panel.imageUrl) imageCount++
            if (panel.videoUrl) videoCount++
          }
        }
      }
      // 取第一集的 novelText 前 100 字作为预览
      const firstEp = projectEntry.episodes[0]
      const preview = firstEp?.novelText ? firstEp.novelText.slice(0, 100) : null
      return [projectEntry.id, {
        episodes: projectEntry.episodes.length,
        images: imageCount,
        videos: videoCount,
        panels: panelCount,
        firstEpisodePreview: preview
      }]
    })
  )

  // 合并项目、费用与统计
  const projectsWithStats = projects.map(project => ({
    ...project,
    totalCost: costMap.get(project.id) ?? 0,
    stats: statsMap.get(project.id) ?? { episodes: 0, images: 0, videos: 0, panels: 0, firstEpisodePreview: null }
  }))

  return NextResponse.json({
    projects: projectsWithStats,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  })
})

// POST - 创建新项目
export const POST = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const draft = readProjectDraftBody(body)
  const validationIssue = validateProjectDraft(draft)
  if (validationIssue) {
    const locale = resolveTaskLocale(request, body) ?? 'zh'
    throw new ApiError('INVALID_PARAMS', {
      code: validationIssue.code,
      field: validationIssue.field,
      ...(typeof validationIssue.limit === 'number' ? { limit: validationIssue.limit } : {}),
      message: formatProjectValidationIssue(validationIssue, locale),
    })
  }

  const { name, description } = normalizeProjectDraft(draft)

  // 获取用户偏好配置
  const userPreference = await prisma.userPreference.findUnique({
    where: { userId: session.user.id }
  })

  // 创建基础项目并直接写入项目级配置，不再创建模式外壳表
  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      userId: session.user.id,
      ...(userPreference && {
        analysisModel: userPreference.analysisModel,
        characterModel: userPreference.characterModel,
        locationModel: userPreference.locationModel,
        storyboardModel: userPreference.storyboardModel,
        editModel: userPreference.editModel,
        videoModel: userPreference.videoModel,
        audioModel: userPreference.audioModel,
        videoRatio: userPreference.videoRatio,
        videoResolution: userPreference.videoResolution,
        artStyle: isArtStyleValue(userPreference.artStyle) ? userPreference.artStyle : 'american-comic',
        imageResolution: userPreference.imageResolution,
      })
    }
  })

  return NextResponse.json({ project }, { status: 201 })
})
