'use client'

import { useMemo } from 'react'
import {
  useTaskTargetStateMap,
  type TaskTargetState,
  type TaskTargetStateQuery,
} from './useTaskTargetStateMap'
import {
  resolveTaskPresentationState,
  type TaskPresentationResource,
  type TaskPresentationState,
} from '@/lib/task/presentation'

export type TaskPresentationTarget = {
  key: string
  targetType: string
  targetId: string
  types?: string[]
  resource: TaskPresentationResource
  hasOutput: boolean
}

type TaskPresentationOptions =
  | boolean
  | {
      enabled?: boolean
      staleTime?: number
    }
  | undefined

type TaskPresentationResult = {
  statesByKey: Map<string, TaskPresentationState>
  taskStatesByKey: Map<string, TaskTargetState>
  getState: (key: string) => TaskPresentationState | null
  getTaskState: (key: string) => TaskTargetState | null
  isFetching: boolean
}

function useTaskPresentationInternal(
  projectId: string | null | undefined,
  targets: TaskPresentationTarget[],
  options: TaskPresentationOptions = true,
): TaskPresentationResult {
  const resolvedOptions = typeof options === 'boolean'
    ? { enabled: options }
    : (options || {})
  const enabled = resolvedOptions.enabled ?? true

  const targetQueries = useMemo<TaskTargetStateQuery[]>(
    () =>
      targets.map((target) => ({
        targetType: target.targetType,
        targetId: target.targetId,
        ...(target.types && target.types.length > 0 ? { types: target.types } : {}),
      })),
    [targets],
  )

  const taskStates = useTaskTargetStateMap(projectId, targetQueries, {
    enabled: enabled && !!projectId && targetQueries.length > 0,
    staleTime: resolvedOptions.staleTime,
  })

  const taskStatesByKey = useMemo(() => {
    const map = new Map<string, TaskTargetState>()
    for (const target of targets) {
      const state = taskStates.byKey.get(`${target.targetType}:${target.targetId}`) || null
      if (!state) continue
      map.set(target.key, state)
    }
    return map
  }, [targets, taskStates.byKey])

  const statesByKey = useMemo(() => {
    const map = new Map<string, TaskPresentationState>()
    for (const target of targets) {
      const state = taskStatesByKey.get(target.key)
      if (!state) continue
      map.set(
        target.key,
        resolveTaskPresentationState({
          phase: state.phase,
          intent: state.intent,
          resource: target.resource,
          hasOutput: target.hasOutput || !!state.hasOutputAtStart,
        }),
      )
    }
    return map
  }, [targets, taskStatesByKey])

  const getState = useMemo(
    () => (key: string) => statesByKey.get(key) || null,
    [statesByKey],
  )
  const getTaskState = useMemo(
    () => (key: string) => taskStatesByKey.get(key) || null,
    [taskStatesByKey],
  )

  return useMemo(
    () => ({
      statesByKey,
      taskStatesByKey,
      getState,
      getTaskState,
      isFetching: taskStates.isFetching,
    }),
    [statesByKey, taskStatesByKey, getState, getTaskState, taskStates.isFetching],
  )
}

export function useAssetTaskPresentation(
  projectId: string | null | undefined,
  targets: TaskPresentationTarget[],
  options: TaskPresentationOptions = true,
) {
  return useTaskPresentationInternal(projectId, targets, options)
}

export function useStoryboardTaskPresentation(
  projectId: string | null | undefined,
  targets: TaskPresentationTarget[],
  options: TaskPresentationOptions = true,
) {
  return useTaskPresentationInternal(projectId, targets, options)
}

export function useVideoTaskPresentation(
  projectId: string | null | undefined,
  targets: TaskPresentationTarget[],
  options: TaskPresentationOptions = true,
) {
  return useTaskPresentationInternal(projectId, targets, options)
}

export function useVoiceTaskPresentation(
  projectId: string | null | undefined,
  targets: TaskPresentationTarget[],
  options: TaskPresentationOptions = true,
) {
  return useTaskPresentationInternal(projectId, targets, options)
}
