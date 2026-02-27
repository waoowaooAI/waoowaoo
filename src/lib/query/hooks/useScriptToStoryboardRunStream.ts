'use client'

import { useRunStreamState, type RunResult } from './useRunStreamState'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'

export type ScriptToStoryboardRunParams = {
  episodeId: string
  model?: string
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export type ScriptToStoryboardRunResult = RunResult

type UseScriptToStoryboardRunStreamOptions = {
  projectId: string
  episodeId?: string | null
}

export function useScriptToStoryboardRunStream({ projectId, episodeId }: UseScriptToStoryboardRunStreamOptions) {
  return useRunStreamState<ScriptToStoryboardRunParams>({
    projectId,
    endpoint: (pid) => `/api/novel-promotion/${pid}/script-to-storyboard-stream`,
    storageKeyPrefix: 'novel-promotion:script-to-storyboard-run',
    storageScopeKey: episodeId || undefined,
    eventSourceMode: 'external',
    acceptedTaskTypes: [TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN],
    resolveActiveTaskId: async ({ projectId: pid, storageScopeKey }) => {
      if (!storageScopeKey) return null
      const search = new URLSearchParams({
        projectId: pid,
        targetType: 'episode',
        targetId: storageScopeKey,
        limit: '20',
      })
      search.append('type', TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)
      search.append('status', TASK_STATUS.QUEUED)
      search.append('status', TASK_STATUS.PROCESSING)
      search.set('_v', '2')
      const response = await fetch(`/api/tasks?${search.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) return null
      const data = await response.json().catch(() => null)
      const tasks = data && typeof data === 'object' && Array.isArray((data as { tasks?: unknown[] }).tasks)
        ? (data as { tasks: Array<{ id?: unknown }> }).tasks
        : []
      for (const task of tasks) {
        if (task && typeof task.id === 'string' && task.id) {
          return task.id
        }
      }
      return null
    },
    validateParams: (params) => {
      if (!params.episodeId) {
        throw new Error('episodeId is required')
      }
    },
    buildRequestBody: (params) => ({
      episodeId: params.episodeId,
      model: params.model || undefined,
      temperature: params.temperature,
      reasoning: params.reasoning,
      reasoningEffort: params.reasoningEffort,
      async: true,
      displayMode: 'detail',
    }),
  })
}
