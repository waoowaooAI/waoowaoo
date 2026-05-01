'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { checkApiResponse } from '@/lib/error-handler'
import { queryKeys } from '@/lib/query/keys'
import type {
  ProjectCanvasLayoutSnapshot,
  UpsertCanvasLayoutInput,
} from '@/lib/project-canvas/layout/canvas-layout-contract'

interface CanvasLayoutResponse {
  readonly success: boolean
  readonly layout: ProjectCanvasLayoutSnapshot | null
}

async function readCanvasLayout(projectId: string, episodeId: string): Promise<ProjectCanvasLayoutSnapshot | null> {
  const search = new URLSearchParams({ episodeId })
  const response = await apiFetch(`/api/projects/${projectId}/canvas-layout?${search.toString()}`)
  await checkApiResponse(response)
  const payload = await response.json() as CanvasLayoutResponse
  return payload.layout
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
  const payload = await response.json() as CanvasLayoutResponse
  if (!payload.layout) {
    throw new Error('canvas layout save returned empty layout')
  }
  return payload.layout
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

  return {
    layout: query.data ?? null,
    isLoading: query.isLoading,
    loadError: query.error,
    saveLayout: mutation.mutateAsync,
    isSaving: mutation.isPending,
    saveError: mutation.error,
  }
}
