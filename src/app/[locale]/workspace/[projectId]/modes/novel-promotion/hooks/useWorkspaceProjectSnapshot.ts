'use client'

import { useMemo } from 'react'
import type { NovelPromotionWorkspaceProps } from '../types'
import type { CapabilitySelections } from '@/lib/model-config-contract'

function parseCapabilitySelections(raw: unknown): CapabilitySelections {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CapabilitySelections
  }
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as CapabilitySelections
  } catch {
    return {}
  }
}

export function useWorkspaceProjectSnapshot({
  project,
  episode,
  urlStage,
}: Pick<NovelPromotionWorkspaceProps, 'project' | 'episode' | 'urlStage'>) {
  return useMemo(() => {
    const projectData = project.novelPromotionData
    const capabilityOverrides = parseCapabilitySelections(projectData?.capabilityOverrides)
    return {
      projectData,
      projectCharacters: projectData?.characters || [],
      projectLocations: projectData?.locations || [],
      episodeStoryboards: episode?.storyboards || [],
      currentStage: urlStage === 'editor' ? 'videos' : (urlStage || 'config'),
      globalAssetText: projectData?.globalAssetText || '',
      novelText: episode?.novelText || '',
      analysisModel: projectData?.analysisModel,
      characterModel: projectData?.characterModel,
      locationModel: projectData?.locationModel,
      storyboardModel: projectData?.storyboardModel,
      editModel: projectData?.editModel,
      videoModel: projectData?.videoModel,
      videoRatio: projectData?.videoRatio,
      capabilityOverrides,
      ttsRate: projectData?.ttsRate,
      artStyle: projectData?.artStyle,
    }
  }, [episode?.novelText, episode?.storyboards, project.novelPromotionData, urlStage])
}
