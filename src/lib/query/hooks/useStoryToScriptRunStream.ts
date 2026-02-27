'use client'

import { useRunStreamState, type RunResult } from './useRunStreamState'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'

export type StoryToScriptRunParams = {
  episodeId: string
  content: string
  model?: string
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export type StoryToScriptRunResult = RunResult

type UseStoryToScriptRunStreamOptions = {
  projectId: string
  episodeId?: string | null
}

export function useStoryToScriptRunStream({ projectId, episodeId }: UseStoryToScriptRunStreamOptions) {
  return useRunStreamState<StoryToScriptRunParams>({
    projectId,
    endpoint: (pid) => `/api/novel-promotion/${pid}/story-to-script-stream`,
    storageKeyPrefix: 'novel-promotion:story-to-script-run',
    storageScopeKey: episodeId || undefined,
    eventSourceMode: 'external',
    acceptedTaskTypes: [TASK_TYPE.STORY_TO_SCRIPT_RUN],
    resolveActiveTaskId: async ({ projectId: pid, storageScopeKey }) => {
      if (!storageScopeKey) return null
      const search = new URLSearchParams({
        projectId: pid,
        targetType: 'episode',
        targetId: storageScopeKey,
        limit: '20',
      })
      search.append('type', TASK_TYPE.STORY_TO_SCRIPT_RUN)
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
      if (!params.content.trim()) {
        throw new Error('content is required')
      }
    },
    buildRequestBody: (params) => ({
      episodeId: params.episodeId,
      content: params.content,
      model: params.model || undefined,
      temperature: params.temperature,
      reasoning: params.reasoning,
      reasoningEffort: params.reasoningEffort,
      async: true,
      displayMode: 'detail',
    }),
  })
}
