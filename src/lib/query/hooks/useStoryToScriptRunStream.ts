'use client'

import { useRunStreamState, type RunResult } from './useRunStreamState'
import { TASK_TYPE } from '@/lib/task/types'
import { apiFetch } from '@/lib/api-fetch'
import { selectRecoverableRun } from '@/lib/run-runtime/recovery'

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
    endpoint: (pid) => `/api/projects/${pid}/commands`,
    storageKeyPrefix: 'project-workflow:story-to-script-run',
    storageScopeKey: episodeId || undefined,
    resolveActiveRunId: async ({ projectId: pid, storageScopeKey }) => {
      if (!storageScopeKey) return null
      const search = new URLSearchParams({
        projectId: pid,
        workflowType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        targetType: 'ProjectEpisode',
        targetId: storageScopeKey,
        episodeId: storageScopeKey,
        limit: '20',
      })
      search.append('status', 'queued')
      search.append('status', 'running')
      search.append('status', 'canceling')
      search.set('_v', '2')
      const response = await apiFetch(`/api/runs?${search.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) return null
      const data = await response.json().catch(() => null)
      const runs = data && typeof data === 'object' && Array.isArray((data as { runs?: unknown[] }).runs)
        ? (data as {
          runs: Array<{
            id?: unknown
            status?: unknown
            createdAt?: unknown
            updatedAt?: unknown
            leaseExpiresAt?: unknown
            heartbeatAt?: unknown
          }>
        }).runs
        : []
      const decision = selectRecoverableRun(runs.map((run) => ({
        id: typeof run?.id === 'string' ? run.id : null,
        status: typeof run?.status === 'string' ? run.status : null,
        createdAt: typeof run?.createdAt === 'string' ? run.createdAt : null,
        updatedAt: typeof run?.updatedAt === 'string' ? run.updatedAt : null,
        leaseExpiresAt: typeof run?.leaseExpiresAt === 'string' ? run.leaseExpiresAt : null,
        heartbeatAt: typeof run?.heartbeatAt === 'string' ? run.heartbeatAt : null,
      })))
      return decision.runId
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
      commandType: 'run_workflow_package',
      source: 'gui',
      workflowId: 'story-to-script',
      episodeId: params.episodeId,
      input: {
        content: params.content,
        model: params.model || undefined,
        temperature: params.temperature,
        reasoning: params.reasoning,
        reasoningEffort: params.reasoningEffort,
      },
    }),
  })
}
