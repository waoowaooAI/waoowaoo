'use client'

import { useCallback, useState } from 'react'
import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import type { VideoPanel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import type { EpisodeVideoUrlsResponse } from './types'
import { getErrorMessage } from './utils'

interface MutationLike<TInput = unknown, TOutput = unknown> {
  mutateAsync: (input: TInput) => Promise<TOutput>
}

interface UseVideoDownloadAllParams {
  episodeId: string
  t: (key: string) => string
  allPanels: VideoPanel[]
  panelVideoPreference: Map<string, boolean>
  listEpisodeVideoUrlsMutation: MutationLike<{
    episodeId: string
    panelPreferences: Record<string, boolean>
  }>
  downloadRemoteBlobMutation: MutationLike<string, Blob>
}

export function useVideoDownloadAll({
  episodeId,
  t,
  allPanels,
  panelVideoPreference,
  listEpisodeVideoUrlsMutation,
  downloadRemoteBlobMutation,
}: UseVideoDownloadAllParams) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)

  const videosWithUrl = allPanels.filter((panel) => panel.videoUrl).length

  const handleDownloadAllVideos = useCallback(async () => {
    if (videosWithUrl === 0) return
    setIsDownloading(true)
    setDownloadProgress(null)

    try {
      const JSZip = (await import('jszip')).default
      const panelPreferences: Record<string, boolean> = {}
      allPanels.forEach((panel) => {
        const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
        panelPreferences[panelKey] = panelVideoPreference.get(panelKey) ?? true
      })

      _ulogInfo('[下载视频] 获取视频URL列表...')
      const data = await listEpisodeVideoUrlsMutation.mutateAsync({
        episodeId,
        panelPreferences,
      })
      const result = (data || {}) as EpisodeVideoUrlsResponse
      const videos = result.videos || []
      const projectName = result.projectName || 'videos'

      if (videos.length === 0) {
        throw new Error(t('stage.noVideos'))
      }

      _ulogInfo(`[下载视频] 共 ${videos.length} 个视频，开始下载...`)
      setDownloadProgress({ current: 0, total: videos.length })

      const zip = new JSZip()
      for (let index = 0; index < videos.length; index += 1) {
        const video = videos[index]
        _ulogInfo(`[下载视频] 下载 ${index + 1}/${videos.length}: ${video.fileName}`)
        setDownloadProgress({ current: index + 1, total: videos.length })

        try {
          const blob = await downloadRemoteBlobMutation.mutateAsync(video.videoUrl)
          zip.file(video.fileName, blob)
        } catch (error) {
          _ulogError(`[下载视频] 下载失败: ${video.fileName}`, error)
        }
      }

      _ulogInfo('[下载视频] 生成 ZIP 文件...')
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(zipBlob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${projectName}_videos.zip`
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
      _ulogInfo('[下载视频] 完成!')
    } catch (error: unknown) {
      _ulogError('[下载视频] 错误:', error)
      alert(`${t('stage.downloadFailed')}: ${getErrorMessage(error) || t('errors.unknownError')}`)
    } finally {
      setIsDownloading(false)
      setDownloadProgress(null)
    }
  }, [
    allPanels,
    downloadRemoteBlobMutation,
    episodeId,
    listEpisodeVideoUrlsMutation,
    panelVideoPreference,
    t,
    videosWithUrl,
  ])

  return {
    isDownloading,
    downloadProgress,
    videosWithUrl,
    handleDownloadAllVideos,
  }
}
