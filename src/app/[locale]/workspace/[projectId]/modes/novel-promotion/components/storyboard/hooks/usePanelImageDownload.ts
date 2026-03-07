'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { NovelPromotionStoryboard } from '@/types/project'
import { extractErrorMessage } from '@/lib/errors/extract'

interface DownloadImagesMutationLike {
  mutateAsync: (payload: { episodeId: string }) => Promise<Blob>
}

interface UsePanelImageDownloadParams {
  localStoryboards: NovelPromotionStoryboard[]
  downloadImagesMutation: DownloadImagesMutationLike
  setIsDownloadingImages: React.Dispatch<React.SetStateAction<boolean>>
}

export function usePanelImageDownload({
  localStoryboards,
  downloadImagesMutation,
  setIsDownloadingImages,
}: UsePanelImageDownloadParams) {
  const t = useTranslations('storyboard')
  const downloadAllImages = useCallback(async () => {
    const firstEpisodeId = localStoryboards[0]?.episodeId
    if (!firstEpisodeId) {
      alert(t('messages.episodeNotFound'))
      return
    }

    setIsDownloadingImages(true)
    try {
      const blob = await downloadImagesMutation.mutateAsync({ episodeId: firstEpisodeId })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'images.zip'
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
    } catch (error: unknown) {
      alert(
        t('messages.downloadFailed', {
          error: extractErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setIsDownloadingImages(false)
    }
  }, [downloadImagesMutation, localStoryboards, setIsDownloadingImages, t])

  return {
    downloadAllImages,
  }
}
