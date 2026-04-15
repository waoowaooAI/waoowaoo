'use client'

import type { StageArtifactReadiness } from '@/lib/project-workflow/stage-readiness'

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
  stageArtifacts: StageArtifactReadiness
  t: (key: string) => string
}

export function useWorkspaceStageNavigation({
  isAnyOperationRunning,
  stageArtifacts,
  t,
}: UseWorkspaceStageNavigationParams): CapsuleNavItem[] {
  const getStageStatus = (stageId: string): 'empty' | 'active' | 'processing' | 'ready' => {
    if (isAnyOperationRunning) return 'processing'

    switch (stageId) {
      case 'config':
        return stageArtifacts.hasStory ? 'ready' : 'active'
      case 'assets':
        return stageArtifacts.hasScript ? 'ready' : 'empty'
      case 'storyboard':
        return stageArtifacts.hasStoryboard ? 'ready' : 'empty'
      case 'videos':
      case 'editor':
        return stageArtifacts.hasVideo ? 'ready' : 'empty'
      case 'voice':
        return stageArtifacts.hasVoice ? 'ready' : 'empty'
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
