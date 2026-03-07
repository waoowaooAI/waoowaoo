'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useCallback } from 'react'
import type { NovelPromotionPanel } from '@/types/project'
import { useCandidateSystem } from '@/hooks/common/useCandidateSystem'
import {
  useRefreshProjectAssets,
  useRefreshEpisodeData,
  useRefreshStoryboards,
} from '@/lib/query/hooks'
import { useSelectProjectPanelCandidate } from '@/lib/query/mutations/useProjectMutations'
import {
  ensurePanelCandidatesInitialized,
  getErrorMessage,
  getPanelCandidatesFromRuntime,
  type PanelCandidateData,
} from './panel-candidate-runtime'
import { usePanelEpisodeCachePatch } from './usePanelEpisodeCachePatch'

interface UsePanelCandidatesProps {
  projectId: string
  episodeId?: string
  onConfirmed?: (panelId: string, imageUrl: string | null) => void
}

interface SelectPanelCandidateResult {
  imageUrl?: string
}

export function usePanelCandidates({
  projectId,
  episodeId,
  onConfirmed,
}: UsePanelCandidatesProps) {
  const t = useTranslations('storyboard')
  const onSilentRefresh = useRefreshProjectAssets(projectId)
  const refreshEpisode = useRefreshEpisodeData(projectId, episodeId ?? null)
  const refreshStoryboards = useRefreshStoryboards(episodeId ?? null)
  const selectCandidateMutation = useSelectProjectPanelCandidate(projectId)

  const candidateSystem = useCandidateSystem<string>()
  const patchPanelInEpisodeCache = usePanelEpisodeCachePatch({
    projectId,
    episodeId,
  })

  const handleEnsurePanelCandidatesInitialized = useCallback((panel: NovelPromotionPanel): boolean => {
    return ensurePanelCandidatesInitialized(panel, candidateSystem)
  }, [candidateSystem])

  const getPanelCandidates = useCallback((panel: NovelPromotionPanel): PanelCandidateData | null => {
    return getPanelCandidatesFromRuntime(panel, candidateSystem)
  }, [candidateSystem])

  const selectPanelCandidateIndex = useCallback((panelId: string, index: number) => {
    candidateSystem.selectCandidate(panelId, index)
  }, [candidateSystem])

  const confirmPanelCandidate = useCallback(async (panelId: string, imageUrl: string) => {
    try {
      _ulogInfo('[confirmPanelCandidate] 🎯 开始确认候选图片')
      _ulogInfo('[confirmPanelCandidate] panelId:', panelId)
      _ulogInfo('[confirmPanelCandidate] imageUrl:', imageUrl.substring(0, 100))

      const data = await selectCandidateMutation.mutateAsync({
        panelId,
        selectedImageUrl: imageUrl,
        action: 'select',
      })
      const result = (data || {}) as SelectPanelCandidateResult

      candidateSystem.clearCandidates(panelId)
      _ulogInfo('[confirmPanelCandidate] ✅ 已清除本地候选状态')

      const confirmedImageUrl = result.imageUrl || imageUrl
      onConfirmed?.(panelId, confirmedImageUrl)
      patchPanelInEpisodeCache(panelId, {
        imageUrl: confirmedImageUrl,
        candidateImages: null,
        imageTaskRunning: false,
        imageErrorMessage: null,
      })

      if (onSilentRefresh) {
        await onSilentRefresh()
      }
      refreshEpisode()
      refreshStoryboards()
      _ulogInfo('[confirmPanelCandidate] ✅ 数据刷新完成')
    } catch (error: unknown) {
      _ulogError('[confirmPanelCandidate] ❌ 确认失败:', error)
      alert(
        t('messages.selectCandidateFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    }
  }, [
    candidateSystem,
    onConfirmed,
    onSilentRefresh,
    patchPanelInEpisodeCache,
    refreshEpisode,
    refreshStoryboards,
    selectCandidateMutation,
    t,
  ])

  const cancelPanelCandidate = useCallback(async (panelId: string) => {
    try {
      await selectCandidateMutation.mutateAsync({
        panelId,
        action: 'cancel',
      })

      candidateSystem.clearCandidates(panelId)
      patchPanelInEpisodeCache(panelId, {
        candidateImages: null,
        imageTaskRunning: false,
      })

      if (onSilentRefresh) {
        await onSilentRefresh()
      }
      refreshEpisode()
      refreshStoryboards()
    } catch (error: unknown) {
      _ulogError('取消选择失败:', error)
    }
  }, [
    candidateSystem,
    onSilentRefresh,
    patchPanelInEpisodeCache,
    refreshEpisode,
    refreshStoryboards,
    selectCandidateMutation,
  ])

  const hasPanelCandidates = useCallback((panel: NovelPromotionPanel): boolean => {
    return getPanelCandidates(panel) !== null
  }, [getPanelCandidates])

  return {
    panelCandidateIndex: candidateSystem.states,
    setPanelCandidateIndex: candidateSystem.selectCandidate,
    getPanelCandidates,
    ensurePanelCandidatesInitialized: handleEnsurePanelCandidatesInitialized,
    selectPanelCandidateIndex,
    confirmPanelCandidate,
    cancelPanelCandidate,
    hasPanelCandidates,
    candidateSystem,
  }
}
