'use client'

import { useMemo } from 'react'
import { resolveTaskPresentationState, type TaskPresentationState } from '@/lib/task/presentation'

interface UseStoryboardStageStatusProps {
  addingStoryboardGroup: boolean
  isTransitioning: boolean
}

export function useStoryboardStageStatus({
  addingStoryboardGroup,
  isTransitioning,
}: UseStoryboardStageStatusProps) {
  const addingStoryboardGroupState = useMemo<TaskPresentationState | null>(() => {
    if (!addingStoryboardGroup) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'text',
      hasOutput: false,
    })
  }, [addingStoryboardGroup])

  const transitioningState = useMemo<TaskPresentationState | null>(() => {
    if (!isTransitioning) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'video',
      hasOutput: false,
    })
  }, [isTransitioning])

  return {
    addingStoryboardGroupState,
    transitioningState,
  }
}
