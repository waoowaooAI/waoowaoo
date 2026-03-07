'use client'

import { useMemo } from 'react'
import type { Storyboard } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import { useVideoTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'
import { buildPanelLipTargets, buildPanelVideoTargets } from './task-targets'

interface UseVideoTaskStatesParams {
  projectId: string
  storyboards: Storyboard[]
}

export function useVideoTaskStates({
  projectId,
  storyboards,
}: UseVideoTaskStatesParams) {
  const panelVideoTargets = useMemo(() => buildPanelVideoTargets(storyboards), [storyboards])
  const panelLipTargets = useMemo(() => buildPanelLipTargets(storyboards), [storyboards])

  const panelVideoStates = useVideoTaskPresentation(projectId, panelVideoTargets, {
    enabled: !!projectId && panelVideoTargets.length > 0,
  })
  const panelLipStates = useVideoTaskPresentation(projectId, panelLipTargets, {
    enabled: !!projectId && panelLipTargets.length > 0,
  })

  return {
    panelVideoStates,
    panelLipStates,
  }
}
