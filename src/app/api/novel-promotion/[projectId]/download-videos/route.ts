import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import archiver from 'archiver'
import { getCOSClient, toFetchableUrl } from '@/lib/cos'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface PanelData {
  panelIndex: number | null
  description: string | null
  videoUrl: string | null
  lipSyncVideoUrl: string | null
}

interface StoryboardData {
  id: string
  clipId: string
  panels?: PanelData[]
}

interface ClipData {
  id: string
}

interface EpisodeData {
  storyboards?: StoryboardData[]
  clips?: ClipData[]
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 解析请求体
  const body = await request.json()
  const { episodeId, panelPreferences } = body as {
    episodeId?: string
    panelPreferences?: Record<string, boolean>  // key: panelKey, value: true=口型同步, false=原始
  }

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { project } = authResult

  // 根据是否指定 episodeId 来获取数据
  let episodes: EpisodeData[] = []

  if (episodeId) {
    // 只获取指定剧集的数据
    const episode = await prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      include: {
        storyboards: {
          include: {
            panels: { orderBy: { panelIndex: 'asc' } }
          },
          orderBy: { createdAt: 'asc' }
        },
        clips: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })
    if (episode) {
      episodes = [episode]
    }
  } else {
    // 获取所有剧集的数据
    const npData = await prisma.novelPromotionProject.findFirst({
      where: { projectId },
      include: {
        episodes: {
          include: {
            storyboards: {
              include: {
                panels: { orderBy: { panelIndex: 'asc' } }
              },
              orderBy: { createdAt: 'asc' }
            },
            clips: {
              orderBy: { createdAt: 'asc' }
            }
          }
        }
      }
    })
    episodes = npData?.episodes || []
  }

  if (episodes.length === 0) {
    throw new ApiError('NOT_FOUND')
  }

  // 收集所有有视频的 panel
  interface VideoItem {
    description: string
    videoUrl: string
    clipIndex: number  // 使用 clip 在数组中的索引
    panelIndex: number
    isLipSync?: boolean  // 是否为口型同步视频
  }
  const videos: VideoItem[] = []

  // 从 episodes 中获取所有 storyboards 和 clips
  const allStoryboards: StoryboardData[] = []
  const allClips: ClipData[] = []
  for (const episode of episodes) {
    allStoryboards.push(...(episode.storyboards || []))
    allClips.push(...(episode.clips || []))
  }

  // 遍历所有 storyboard 和 panel
  for (const storyboard of allStoryboards) {
    // 使用 clip 在 clips 数组中的索引来排序（兼容 Agent 模式）
    const clipIndex = allClips.findIndex((clip) => clip.id === storyboard.clipId)

    // 使用独立的 Panel 记录
    const panels = storyboard.panels || []
    for (const panel of panels) {
      // 构建 panelKey 用于查找偏好
      const panelKey = `${storyboard.id}-${panel.panelIndex || 0}`
      // 获取该 panel 的偏好，默认 true（口型同步优先）
      const preferLipSync = panelPreferences?.[panelKey] ?? true

      // 根据用户偏好选择视频类型
      let videoUrl: string | null = null
      let isLipSync = false

      if (preferLipSync) {
        // 优先口型同步视频，其次原始视频
        videoUrl = panel.lipSyncVideoUrl || panel.videoUrl
        isLipSync = !!panel.lipSyncVideoUrl
      } else {
        // 优先原始视频，其次口型同步视频（如果只有口型同步视频也下载）
        videoUrl = panel.videoUrl || panel.lipSyncVideoUrl
        isLipSync = !panel.videoUrl && !!panel.lipSyncVideoUrl
      }

      if (videoUrl) {
        videos.push({
          description: panel.description || `镜头`,
          videoUrl: videoUrl,
          clipIndex: clipIndex >= 0 ? clipIndex : 999,  // 找不到时排最后
          panelIndex: panel.panelIndex || 0,
          isLipSync
        })
      }
    }
  }

  // 按 clipIndex 和 panelIndex 排序
  videos.sort((a, b) => {
    if (a.clipIndex !== b.clipIndex) {
      return a.clipIndex - b.clipIndex
    }
    return a.panelIndex - b.panelIndex
  })

  // 重新分配连续的全局索引
  const indexedVideos = videos.map((v, idx) => ({
    ...v,
    index: idx + 1
  }))

  if (indexedVideos.length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  _ulogInfo(`Preparing to download ${indexedVideos.length} videos for project ${projectId}`)

  const archive = archiver('zip', { zlib: { level: 9 } })

  // 创建一个 Promise 来追踪归档完成状态
  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve())
    archive.on('error', (err) => {
      reject(err)
    })
  })

  // 使用 PassThrough 流来收集数据
  const chunks: Uint8Array[] = []
  archive.on('data', (chunk) => {
    chunks.push(chunk)
  })

  // 处理视频并打包
  const isLocal = process.env.STORAGE_TYPE === 'local'

  for (const video of indexedVideos) {
    try {
      _ulogInfo(`Downloading video ${video.index}: ${video.videoUrl}`)

      let videoData: Buffer
      const storageKey = await resolveStorageKeyFromMediaValue(video.videoUrl)

      if (video.videoUrl.startsWith('http://') || video.videoUrl.startsWith('https://')) {
        const response = await fetch(toFetchableUrl(video.videoUrl))
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        videoData = Buffer.from(arrayBuffer)
      } else if (storageKey) {
        if (isLocal) {
          const { getSignedUrl } = await import('@/lib/cos')
          const localUrl = toFetchableUrl(getSignedUrl(storageKey))
          const response = await fetch(localUrl)
          if (!response.ok) {
            throw new Error(`Failed to fetch local file: ${response.statusText}`)
          }
          videoData = Buffer.from(await response.arrayBuffer())
        } else {
          const cos = getCOSClient()
          videoData = await new Promise<Buffer>((resolve, reject) => {
            cos.getObject(
              {
                Bucket: process.env.COS_BUCKET!,
                Region: process.env.COS_REGION!,
                Key: storageKey
              },
              (err, data) => {
                if (err) reject(err)
                else resolve(data.Body as Buffer)
              }
            )
          })
        }
      } else {
        const response = await fetch(toFetchableUrl(video.videoUrl))
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        videoData = Buffer.from(arrayBuffer)
      }

      // 文件名使用描述，清理非法字符
      const safeDesc = video.description.slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')
      const fileName = `${String(video.index).padStart(3, '0')}_${safeDesc}.mp4`
      archive.append(videoData, { name: fileName })
      _ulogInfo(`Added ${fileName} to archive`)
    } catch (error) {
      _ulogError(`Failed to download video ${video.index}:`, error)
    }
  }

  // 完成归档
  await archive.finalize()
  _ulogInfo('Archive finalized')

  // 等待归档完成
  await archiveFinished

  // 合并所有数据块
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return new Response(result, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(project.name)}_videos.zip"`
    }
  })
})
