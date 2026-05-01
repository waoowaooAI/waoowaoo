'use client'

import { useCallback } from 'react'
import { useRegenerateProjectPanelImage } from '@/lib/query/hooks'

interface UseWorkspaceImageActionsParams {
  projectId: string
  episodeId?: string | null
}

export function useWorkspaceImageActions({
  projectId,
  episodeId,
}: UseWorkspaceImageActionsParams) {
  const regeneratePanelImageMutation = useRegenerateProjectPanelImage(projectId, episodeId)

  const handleGeneratePanelImage = useCallback(async (panelId: string, count = 1) => {
    await regeneratePanelImageMutation.mutateAsync({ panelId, count })
  }, [regeneratePanelImageMutation])

  return {
    handleGeneratePanelImage,
  }
}
