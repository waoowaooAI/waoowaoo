'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'
import { applyTaskLifecycleToOverlay } from '../task-target-overlay'
import { isTaskIntent, resolveTaskIntent } from '@/lib/task/intent'

type UseSSEOptions = {
  projectId?: string | null
  episodeId?: string | null
  enabled?: boolean
  onEvent?: (event: SSEEvent) => void
}

export function useSSE({ projectId, episodeId, enabled = true, onEvent }: UseSSEOptions) {
  const queryClient = useQueryClient()
  const sourceRef = useRef<EventSource | null>(null)
  const targetStatesInvalidateTimerRef = useRef<number | null>(null)
  const isGlobalAssetProject = projectId === 'global-asset-hub'

  const url = useMemo(() => {
    if (!projectId) return null
    const params = new URLSearchParams({ projectId })
    if (episodeId) params.set('episodeId', episodeId)
    return `/api/sse?${params}`
  }, [projectId, episodeId])

  useEffect(() => {
    if (!enabled || !url || !projectId) return

    const source = new EventSource(url)
    sourceRef.current = source

    const invalidateEpisodeScoped = (resolvedEpisodeId: string | null) => {
      if (!resolvedEpisodeId) return
      queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, resolvedEpisodeId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(resolvedEpisodeId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(resolvedEpisodeId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.matched(projectId, resolvedEpisodeId) })
    }

    const invalidateByTarget = (targetType: string | null, resolvedEpisodeId: string | null) => {
      if (isGlobalAssetProject) {
        if (targetType?.startsWith('GlobalCharacter')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
          return
        }
        if (targetType?.startsWith('GlobalLocation')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
          return
        }
        if (targetType?.startsWith('GlobalVoice')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.voices() })
          return
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
        return
      }

      if (targetType === 'CharacterAppearance' || targetType === 'NovelPromotionCharacter') {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.characters(projectId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        return
      }
      if (targetType === 'LocationImage' || targetType === 'NovelPromotionLocation') {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.locations(projectId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        return
      }
      if (targetType === 'NovelPromotionVoiceLine') {
        invalidateEpisodeScoped(resolvedEpisodeId)
        return
      }
      if (
        targetType === 'NovelPromotionPanel' ||
        targetType === 'NovelPromotionStoryboard' ||
        targetType === 'NovelPromotionShot'
      ) {
        invalidateEpisodeScoped(resolvedEpisodeId)
        return
      }
      if (targetType === 'NovelPromotionEpisode') {
        invalidateEpisodeScoped(resolvedEpisodeId)
        queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
        return
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
    }

    const handleEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (!payload || !payload.type) return
        onEvent?.(payload as SSEEvent)
        const eventType = payload.type as string
        const targetType = typeof payload.targetType === 'string'
          ? payload.targetType
          : typeof payload?.payload?.targetType === 'string'
            ? payload.payload.targetType
            : null
        const targetId = typeof payload.targetId === 'string'
          ? payload.targetId
          : typeof payload?.payload?.targetId === 'string'
            ? payload.payload.targetId
            : null
        const eventEpisodeId = typeof payload.episodeId === 'string'
          ? payload.episodeId
          : typeof payload?.payload?.episodeId === 'string'
            ? payload.payload.episodeId
            : null
        const resolvedEpisodeId = eventEpisodeId || episodeId || null

        const eventPayload = payload?.payload && typeof payload.payload === 'object'
          ? (payload.payload as Record<string, unknown>)
          : null
        const rawLifecycleType =
          eventType === TASK_SSE_EVENT_TYPE.LIFECYCLE
            ? typeof eventPayload?.lifecycleType === 'string'
              ? eventPayload.lifecycleType
              : null
            : null
        const normalizedLifecycleType =
          rawLifecycleType === TASK_EVENT_TYPE.PROGRESS
            ? TASK_EVENT_TYPE.PROCESSING
            : rawLifecycleType
        const isLifecycleEvent = eventType === TASK_SSE_EVENT_TYPE.LIFECYCLE
        const shouldInvalidateTasksList =
          normalizedLifecycleType === TASK_EVENT_TYPE.CREATED ||
          normalizedLifecycleType === TASK_EVENT_TYPE.COMPLETED ||
          normalizedLifecycleType === TASK_EVENT_TYPE.FAILED ||
          (normalizedLifecycleType === TASK_EVENT_TYPE.PROCESSING &&
            typeof eventPayload?.progress !== 'number')
        const shouldInvalidateTargetStates =
          normalizedLifecycleType === TASK_EVENT_TYPE.COMPLETED ||
          normalizedLifecycleType === TASK_EVENT_TYPE.FAILED

        if (isLifecycleEvent && shouldInvalidateTasksList) {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId) })
        }
        if (isLifecycleEvent && shouldInvalidateTargetStates) {
          if (targetStatesInvalidateTimerRef.current === null) {
            targetStatesInvalidateTimerRef.current = window.setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.tasks.targetStatesAll(projectId), exact: false })
              targetStatesInvalidateTimerRef.current = null
            }, 800)
          }
        }

        const payloadIntent = isTaskIntent(eventPayload?.intent)
          ? eventPayload.intent
          : resolveTaskIntent(typeof payload.taskType === 'string' ? payload.taskType : null)
        const payloadUi =
          eventPayload?.ui && typeof eventPayload.ui === 'object' && !Array.isArray(eventPayload.ui)
            ? (eventPayload.ui as Record<string, unknown>)
            : null
        const hasOutputAtStart =
          typeof payloadUi?.hasOutputAtStart === 'boolean'
            ? payloadUi.hasOutputAtStart
            : null

        applyTaskLifecycleToOverlay(queryClient, {
          projectId,
          lifecycleType: normalizedLifecycleType,
          targetType,
          targetId,
          taskId: typeof payload.taskId === 'string' ? payload.taskId : null,
          taskType: typeof payload.taskType === 'string' ? payload.taskType : null,
          intent: payloadIntent,
          hasOutputAtStart,
          progress: typeof eventPayload?.progress === 'number' ? Math.floor(eventPayload.progress) : null,
          stage: typeof eventPayload?.stage === 'string' ? eventPayload.stage : null,
          stageLabel: typeof eventPayload?.stageLabel === 'string' ? eventPayload.stageLabel : null,
          eventTs: typeof payload.ts === 'string' ? payload.ts : null,
        })

        if (
          normalizedLifecycleType === TASK_EVENT_TYPE.CREATED ||
          normalizedLifecycleType === TASK_EVENT_TYPE.PROCESSING
        ) {
          return
        }

        if (
          normalizedLifecycleType === TASK_EVENT_TYPE.COMPLETED ||
          normalizedLifecycleType === TASK_EVENT_TYPE.FAILED
        ) {
          invalidateByTarget(targetType, resolvedEpisodeId)
        }
      } catch (error) {
        _ulogError('[useSSE] failed to parse event', error)
      }
    }

    source.onmessage = handleEvent
    const namedEvents = [
      TASK_SSE_EVENT_TYPE.LIFECYCLE,
      TASK_SSE_EVENT_TYPE.STREAM,
    ] as const
    const listeners: Array<{ type: string; handler: EventListener }> = []
    for (const type of namedEvents) {
      const handler: EventListener = (event) => handleEvent(event as MessageEvent)
      source.addEventListener(type, handler)
      listeners.push({ type, handler })
    }
    source.onerror = (error) => {
      _ulogError('[useSSE] stream error', error)
    }

    return () => {
      if (targetStatesInvalidateTimerRef.current !== null) {
        window.clearTimeout(targetStatesInvalidateTimerRef.current)
        targetStatesInvalidateTimerRef.current = null
      }
      for (const listener of listeners) {
        source.removeEventListener(listener.type, listener.handler)
      }
      source.close()
      sourceRef.current = null
    }
  }, [enabled, url, projectId, episodeId, queryClient, isGlobalAssetProject, onEvent])

  return {
    connected: !!sourceRef.current && sourceRef.current.readyState === EventSource.OPEN,
  }
}
