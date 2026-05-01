'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { checkApiResponse } from '@/lib/error-handler'
import { queryKeys } from '@/lib/query/keys'
import type {
  ProjectCanvasLayoutSnapshot,
  UpsertCanvasLayoutInput,
} from '@/lib/project-canvas/layout/canvas-layout-contract'
import {
  parseCanvasLayoutReadResponse,
  type CanvasLayoutReadWarningCode,
} from '@/lib/project-canvas/layout/canvas-layout-error-policy'

interface CanvasLayoutWriteResponse {
  readonly success: boolean
  readonly layout: ProjectCanvasLayoutSnapshot | null
}

interface CanvasLayoutPersistenceResult {
  readonly layout: ProjectCanvasLayoutSnapshot | null
  readonly warningCode: CanvasLayoutReadWarningCode | null
}

async function readCanvasLayout(projectId: string, episodeId: string): Promise<CanvasLayoutPersistenceResult> {
  const search = new URLSearchParams({ episodeId })
  const response = await apiFetch(`/api/projects/${projectId}/canvas-layout?${search.toString()}`)
  await checkApiResponse(response)
  const payload = await response.json() as unknown
  return parseCanvasLayoutReadResponse(payload)
}

async function writeCanvasLayout(
  projectId: string,
  input: UpsertCanvasLayoutInput,
): Promise<ProjectCanvasLayoutSnapshot> {
  const response = await apiFetch(`/api/projects/${projectId}/canvas-layout`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  await checkApiResponse(response)
  const payload = await response.json() as CanvasLayoutWriteResponse
  if (!payload.layout) {
    throw new Error('canvas layout save returned empty layout')
  }
  return payload.layout
}

async function resetCanvasLayout(projectId: string, episodeId: string): Promise<void> {
  const search = new URLSearchParams({ episodeId })
  const response = await apiFetch(`/api/projects/${projectId}/canvas-layout?${search.toString()}`, {
    method: 'DELETE',
  })
  await checkApiResponse(response)
}

export function useCanvasLayoutPersistence(params: {
  readonly projectId: string
  readonly episodeId: string
}) {
  const query = useQuery({
    queryKey: queryKeys.project.canvasLayout(params.projectId, params.episodeId),
    queryFn: () => readCanvasLayout(params.projectId, params.episodeId),
    enabled: Boolean(params.projectId && params.episodeId),
  })

  const mutation = useMutation({
    mutationFn: (input: UpsertCanvasLayoutInput) => writeCanvasLayout(params.projectId, input),
  })
  const resetMutation = useMutation({
    mutationFn: () => resetCanvasLayout(params.projectId, params.episodeId),
  })

  return {
    layout: query.data?.layout ?? null,
    layoutWarningCode: query.data?.warningCode ?? null,
    isLoading: query.isLoading,
    loadError: query.error,
    saveLayout: mutation.mutateAsync,
    resetLayout: resetMutation.mutateAsync,
    isSaving: mutation.isPending || resetMutation.isPending,
    saveError: mutation.error || resetMutation.error,
  }
}
