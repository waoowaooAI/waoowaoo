import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'

/**
 * 统一的项目数据加载API
 * 返回项目基础信息、全局配置、全局资产和剧集列表
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 获取基础项目信息
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { user: true }
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  if (project.userId !== session.user.id) {
    throw new ApiError('FORBIDDEN')
  }

  // 🔥 更新最近访问时间（异步，不阻塞响应）
  prisma.project.update({
    where: { id: projectId },
    data: { lastAccessedAt: new Date() }
  }).catch(err => _ulogError('更新访问时间失败:', err))

  // ⚡ 并行执行：加载 novel-promotion 数据
  // 注意：characters/locations 延迟加载，首次只获取 episodes 列表
  const novelPromotionData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      // 剧集列表（基础信息）- 首页必需
      episodes: {
        orderBy: { episodeNumber: 'asc' }
      },
      // ⚡ 角色和场景数据 - 资产显示必需
      characters: {
        include: {
          appearances: true
        },
        orderBy: { createdAt: 'asc' }
      },
      locations: {
        include: {
          images: true
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  })

  if (!novelPromotionData) {
    throw new ApiError('NOT_FOUND')
  }

  // 转换为稳定媒体 URL（并保留兼容字段）
  const novelPromotionDataWithSignedUrls = await attachMediaFieldsToProject(novelPromotionData)

  const fullProject = {
    ...project,
    novelPromotionData: novelPromotionDataWithSignedUrls
    // 🔥 不再用 userPreference 覆盖任何字段
    // editModel 等配置应该直接使用 novelPromotionData 中的值
  }

  return NextResponse.json({ project: fullProject })
})
