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
  imageUrl: string | null
}

interface StoryboardData {
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

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')

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

  // 收集所有有图片的 panel
  interface ImageItem {
    description: string
    imageUrl: string
    clipIndex: number
    panelIndex: number
  }
  const images: ImageItem[] = []

  // 从 episodes 中获取所有 storyboards 和 clips
  const allStoryboards: StoryboardData[] = []
  const allClips: ClipData[] = []
  for (const episode of episodes) {
    allStoryboards.push(...(episode.storyboards || []))
    allClips.push(...(episode.clips || []))
  }

  // 遍历所有 storyboard 和 panel
  for (const storyboard of allStoryboards) {
    // 使用 clip 在 clips 数组中的索引来排序
    const clipIndex = allClips.findIndex((clip) => clip.id === storyboard.clipId)

    // 使用独立的 Panel 记录
    const panels = storyboard.panels || []
    for (const panel of panels) {
      if (panel.imageUrl) {
        images.push({
          description: panel.description || `镜头`,
          imageUrl: panel.imageUrl,
          clipIndex: clipIndex >= 0 ? clipIndex : 999,
          panelIndex: panel.panelIndex || 0
        })
      }
    }
  }

  // 按 clipIndex 和 panelIndex 排序
  images.sort((a, b) => {
    if (a.clipIndex !== b.clipIndex) {
      return a.clipIndex - b.clipIndex
    }
    return a.panelIndex - b.panelIndex
  })

  // 重新分配连续的全局索引
  const indexedImages = images.map((v, idx) => ({
    ...v,
    index: idx + 1
  }))

  if (indexedImages.length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  _ulogInfo(`Preparing to download ${indexedImages.length} images for project ${projectId}`)

  const archive = archiver('zip', { zlib: { level: 9 } })

  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk) => controller.enqueue(chunk))
      archive.on('end', () => controller.close())
      archive.on('error', (err) => controller.error(err))
      processImages()
    }
  })

  async function processImages() {
    const isLocal = process.env.STORAGE_TYPE === 'local'

    for (const image of indexedImages) {
      try {
        _ulogInfo(`Downloading image ${image.index}: ${image.imageUrl}`)

        let imageData: Buffer
        let extension = 'png'
        const storageKey = await resolveStorageKeyFromMediaValue(image.imageUrl)

        if (image.imageUrl.startsWith('http://') || image.imageUrl.startsWith('https://')) {
          // 外部 URL，直接下载
          const response = await fetch(toFetchableUrl(image.imageUrl))
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`)
          }
          const arrayBuffer = await response.arrayBuffer()
          imageData = Buffer.from(arrayBuffer)

          const contentType = response.headers.get('content-type')
          if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
            extension = 'jpg'
          } else if (contentType?.includes('webp')) {
            extension = 'webp'
          }
        } else if (storageKey) {
          if (isLocal) {
            // 本地存储：通过文件服务 API 获取
            const { getSignedUrl } = await import('@/lib/cos')
            const localUrl = toFetchableUrl(getSignedUrl(storageKey))
            const response = await fetch(localUrl)
            if (!response.ok) {
              throw new Error(`Failed to fetch local file: ${response.statusText}`)
            }
            imageData = Buffer.from(await response.arrayBuffer())
          } else {
            // COS：从 COS 下载
            const cos = getCOSClient()
            imageData = await new Promise<Buffer>((resolve, reject) => {
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

          const keyExt = storageKey.split('.').pop()?.toLowerCase()
          if (keyExt && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(keyExt)) {
            extension = keyExt === 'jpeg' ? 'jpg' : keyExt
          }
        } else {
          const response = await fetch(toFetchableUrl(image.imageUrl))
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`)
          }
          const arrayBuffer = await response.arrayBuffer()
          imageData = Buffer.from(arrayBuffer)
        }

        // 文件名使用描述，清理非法字符
        const safeDesc = image.description.slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')
        const fileName = `${String(image.index).padStart(3, '0')}_${safeDesc}.${extension}`
        archive.append(imageData, { name: fileName })
        _ulogInfo(`Added ${fileName} to archive`)
      } catch (error) {
        _ulogError(`Failed to download image ${image.index}:`, error)
      }
    }

    await archive.finalize()
    _ulogInfo('Archive finalized')
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(project.name)}_images.zip"`
    }
  })
})
