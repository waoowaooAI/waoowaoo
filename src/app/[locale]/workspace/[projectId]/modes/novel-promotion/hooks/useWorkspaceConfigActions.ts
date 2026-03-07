'use client'

import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback } from 'react'
import {
  useGetProjectStoryboardStats,
  useUpdateProjectConfig,
  useUpdateProjectEpisodeField,
} from '@/lib/query/hooks'

interface UseWorkspaceConfigActionsParams {
  projectId: string
  episodeId?: string
  onStageChange?: (stage: string) => void
}

export function useWorkspaceConfigActions({
  projectId,
  episodeId,
  onStageChange,
}: UseWorkspaceConfigActionsParams) {
  const updateProjectConfigMutation = useUpdateProjectConfig(projectId)
  const updateProjectEpisodeMutation = useUpdateProjectEpisodeField(projectId)
  const getProjectStoryboardStatsMutation = useGetProjectStoryboardStats(projectId)

  const handleStageChange = useCallback((stage: string) => {
    onStageChange?.(stage)
  }, [onStageChange])

  const handleUpdateConfig = useCallback(async (key: string, value: unknown) => {
    try {
      await updateProjectConfigMutation.mutateAsync({ key, value })
    } catch (error: unknown) {
      _ulogError('Update config error:', error)
    }
  }, [updateProjectConfigMutation])

  const handleUpdateEpisode = useCallback(async (key: string, value: unknown) => {
    if (!episodeId) {
      _ulogError('No episode selected')
      return
    }

    try {
      await updateProjectEpisodeMutation.mutateAsync({ episodeId, key, value })
    } catch (error: unknown) {
      _ulogError('Update episode error:', error)
    }
  }, [episodeId, updateProjectEpisodeMutation])

  const getProjectStoryboardStats = useCallback(async (targetEpisodeId: string) => {
    return getProjectStoryboardStatsMutation.mutateAsync({ episodeId: targetEpisodeId })
  }, [getProjectStoryboardStatsMutation])

  return {
    handleStageChange,
    handleUpdateConfig,
    handleUpdateEpisode,
    getProjectStoryboardStats,
  }
}
