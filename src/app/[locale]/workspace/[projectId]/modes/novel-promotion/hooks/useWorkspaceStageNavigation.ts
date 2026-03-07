'use client'

import type { NovelPromotionPanel } from '@/types/project'

interface EpisodeLike {
  novelText?: string | null
  voiceLines?: unknown[] | null
}

interface StoryboardLike {
  panels?: NovelPromotionPanel[] | null
}

interface CapsuleNavItem {
  id: string
  icon: string
  label: string
  status: 'empty' | 'active' | 'processing' | 'ready'
  disabled?: boolean
  disabledLabel?: string
}

interface UseWorkspaceStageNavigationParams {
  isAnyOperationRunning: boolean
  episode?: EpisodeLike | null
  projectCharacterCount: number
  episodeStoryboards: StoryboardLike[]
  t: (key: string) => string
}

export function useWorkspaceStageNavigation({
  isAnyOperationRunning,
  episode,
  projectCharacterCount,
  episodeStoryboards,
  t,
}: UseWorkspaceStageNavigationParams): CapsuleNavItem[] {
  const getStageStatus = (stageId: string): 'empty' | 'active' | 'processing' | 'ready' => {
    if (isAnyOperationRunning) return 'processing'

    switch (stageId) {
      case 'config':
        return episode?.novelText ? 'ready' : 'active'
      case 'assets':
        return projectCharacterCount > 0 ? 'ready' : 'empty'
      case 'storyboard':
        return episodeStoryboards.some((sb) => sb.panels?.length) ? 'ready' : 'empty'
      case 'videos':
      case 'editor':
        return episodeStoryboards.some((sb) => sb.panels?.some((panel) => panel.videoUrl)) ? 'ready' : 'empty'
      case 'voice':
        return (episode?.voiceLines?.length || 0) > 0 ? 'ready' : 'empty'
      default:
        return 'empty'
    }
  }

  return [
    { id: 'config', icon: 'S', label: t('stages.story'), status: getStageStatus('config') },
    { id: 'script', icon: 'A', label: t('stages.script'), status: getStageStatus('assets') },
    { id: 'storyboard', icon: 'B', label: t('stages.storyboard'), status: getStageStatus('storyboard') },
    { id: 'videos', icon: 'V', label: t('stages.video'), status: getStageStatus('videos') },
    {
      id: 'editor',
      icon: 'E',
      label: t('stages.editor'),
      status: 'empty',
      disabled: true,
      disabledLabel: t('stages.editorComingSoon'),
    },
  ]
}
