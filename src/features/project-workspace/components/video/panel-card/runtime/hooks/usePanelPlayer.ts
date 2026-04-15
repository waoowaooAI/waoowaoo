import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useRef, useState, type MouseEvent } from 'react'

interface UsePanelPlayerParams {
  videoRatio: string
  imageUrl?: string
  videoUrl?: string
  lipSyncVideoUrl?: string
  showLipSyncVideo: boolean
  onPreviewImage?: (imageUrl: string) => void
}

export function usePanelPlayer({
  videoRatio,
  imageUrl,
  videoUrl,
  lipSyncVideoUrl,
  showLipSyncVideo,
  onPreviewImage,
}: UsePanelPlayerParams) {
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cssAspectRatio = videoRatio.replace(':', '/')
  const currentVideoUrl = videoUrl
    ? (showLipSyncVideo && lipSyncVideoUrl ? lipSyncVideoUrl : videoUrl)
    : undefined

  const handlePreviewImage = useCallback((event?: MouseEvent) => {
    if (event) event.stopPropagation()
    if (!imageUrl || !onPreviewImage) return
    onPreviewImage(imageUrl)
  }, [imageUrl, onPreviewImage])

  const handlePlayClick = useCallback(async () => {
    setIsPlaying(true)
    setTimeout(async () => {
      if (!videoRef.current) return
      try {
        await videoRef.current.play()
      } catch (error: unknown) {
        if ((error as { name?: string }).name !== 'AbortError') {
          _ulogError('Video play error:', error)
        }
      }
    }, 100)
  }, [])

  return {
    cssAspectRatio,
    currentVideoUrl,
    isPlaying,
    setIsPlaying,
    videoRef,
    handlePreviewImage,
    handlePlayClick,
  }
}
