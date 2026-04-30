'use client'

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskResponse } from '@/lib/task/client'
import { queryKeys } from '@/lib/query/keys'
import { useTaskTargetStateMap } from '@/lib/query/hooks/useTaskTargetStateMap'
import {
  clearTaskTargetOverlay,
  upsertTaskTargetOverlay,
} from '@/lib/query/task-target-overlay'
import { invalidateByTarget } from '@/lib/query/invalidation/invalidate-by-target'
import type {
  AssetKind,
  AssetQueryInput,
  AssetRenderSummary,
  AssetSummary,
  AssetTaskRef,
  AssetTaskState,
  AssetVariantSummary,
  CharacterAssetSummary,
  LocationAssetSummary,
  PropAssetSummary,
  ReadAssetsResponse,
  VoiceAssetSummary,
} from '@/lib/assets/contracts'

function flattenTaskRefs(assets: AssetSummary[]): AssetTaskRef[] {
  const refs: AssetTaskRef[] = []
  for (const asset of assets) {
    refs.push(...asset.taskRefs)
    if (asset.kind === 'voice') {
      continue
    }
    for (const variant of asset.variants) {
      refs.push(...variant.taskRefs)
      for (const render of variant.renders) {
        refs.push(...render.taskRefs)
      }
    }
  }
  return refs
}

function createTaskState(isRunning: boolean, lastError: { code: string; message: string } | null): AssetTaskState {
  return {
    isRunning,
    lastError,
  }
}

function resolveTaskState(refs: AssetTaskRef[], byKey: Map<string, { phase: string | null; lastError: { code: string; message: string } | null }>): AssetTaskState {
  let isRunning = false
  let lastError: { code: string; message: string } | null = null
  for (const ref of refs) {
    const state = byKey.get(`${ref.targetType}:${ref.targetId}`)
    if (!state) continue
    if (state.phase === 'queued' || state.phase === 'processing') {
      isRunning = true
    }
    if (!lastError && state.lastError) {
      lastError = state.lastError
    }
  }
  return createTaskState(isRunning, lastError)
}

function withTaskState(render: AssetRenderSummary, byKey: Map<string, { phase: string | null; lastError: { code: string; message: string } | null }>): AssetRenderSummary {
  return {
    ...render,
    taskState: resolveTaskState(render.taskRefs, byKey),
  }
}

function withTaskStateVariant(variant: AssetVariantSummary, byKey: Map<string, { phase: string | null; lastError: { code: string; message: string } | null }>): AssetVariantSummary {
  return {
    ...variant,
    renders: variant.renders.map((render) => withTaskState(render, byKey)),
    taskState: resolveTaskState(variant.taskRefs, byKey),
  }
}

function withTaskStateAsset(asset: AssetSummary, byKey: Map<string, { phase: string | null; lastError: { code: string; message: string } | null }>): AssetSummary {
  if (asset.kind === 'voice') {
    const voiceAsset: VoiceAssetSummary = {
      ...asset,
      taskState: resolveTaskState(asset.taskRefs, byKey),
    }
    return voiceAsset
  }

  const variants = asset.variants.map((variant) => withTaskStateVariant(variant, byKey))
  if (asset.kind === 'character') {
    const characterAsset: CharacterAssetSummary = {
      ...asset,
      variants,
      taskState: resolveTaskState(asset.taskRefs, byKey),
    }
    return characterAsset
  }

  if (asset.kind === 'location') {
    const locationAsset: LocationAssetSummary = {
      ...asset,
      variants,
      taskState: resolveTaskState(asset.taskRefs, byKey),
    }
    return locationAsset
  }

  const propAsset: PropAssetSummary = {
    ...asset,
    variants,
    taskState: resolveTaskState(asset.taskRefs, byKey),
  }
  return propAsset
}

function buildQueryPath(input: AssetQueryInput): string {
  const searchParams = new URLSearchParams({
    scope: input.scope,
  })
  if (input.projectId) {
    searchParams.set('projectId', input.projectId)
  }
  if (input.folderId) {
    searchParams.set('folderId', input.folderId)
  }
  if (input.kind) {
    searchParams.set('kind', input.kind)
  }
  return `/api/assets?${searchParams.toString()}`
}

export function useAssets(input: AssetQueryInput) {
  const assetsQuery = useQuery({
    queryKey: queryKeys.assets.list(input),
    queryFn: async () => {
      const response = await apiFetch(buildQueryPath(input))
      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }
      const data = await response.json() as ReadAssetsResponse
      return data.assets
    },
    enabled: input.scope === 'global' || !!input.projectId,
    staleTime: 5_000,
  })

  const taskProjectId = input.scope === 'global' ? 'global-asset-hub' : input.projectId ?? ''
  const taskRefs = useMemo(() => flattenTaskRefs(assetsQuery.data ?? []), [assetsQuery.data])
  const taskTargets = useMemo(() => taskRefs.map((ref) => ({
    targetType: ref.targetType,
    targetId: ref.targetId,
    types: ref.types,
  })), [taskRefs])
  const taskStatesQuery = useTaskTargetStateMap(taskProjectId, taskTargets, {
    enabled: taskProjectId.length > 0 && taskTargets.length > 0,
  })

  const data = useMemo(() => {
    const assets = assetsQuery.data ?? []
    return assets.map((asset) => withTaskStateAsset(asset, taskStatesQuery.byKey))
  }, [assetsQuery.data, taskStatesQuery.byKey])

  return {
    ...assetsQuery,
    data,
    isFetching: assetsQuery.isFetching || taskStatesQuery.isFetching,
  }
}

type AssetActionScopeInput = {
  scope: 'global' | 'project'
  projectId?: string | null
  kind: AssetKind
}

type GenerateOverlayTarget = {
  projectId: string
  targetType: string
  targetId: string
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveGenerateOverlayTarget(
  input: AssetActionScopeInput,
  payload: Record<string, unknown>,
): GenerateOverlayTarget | null {
  const assetId = normalizeOptionalString(payload.id)
    ?? normalizeOptionalString(payload.characterId)
    ?? normalizeOptionalString(payload.locationId)
  if (!assetId) {
    return null
  }

  if (input.scope === 'global') {
    if (input.kind === 'character') {
      const appearanceId = normalizeOptionalString(payload.appearanceId)
      if (!appearanceId) return null
      return {
        projectId: 'global-asset-hub',
        targetType: 'GlobalCharacterAppearance',
        targetId: appearanceId,
      }
    }
    return {
      projectId: 'global-asset-hub',
      targetType: 'GlobalLocation',
      targetId: assetId,
    }
  }

  const projectId = normalizeOptionalString(input.projectId)
  if (!projectId) {
    return null
  }

  if (input.kind === 'character') {
    const appearanceId = normalizeOptionalString(payload.appearanceId)
    return {
      projectId,
      targetType: 'CharacterAppearance',
      targetId: appearanceId ?? assetId,
    }
  }

  return {
    projectId,
    targetType: 'LocationImage',
    targetId: assetId,
  }
}

function resolveAssetTargetType(input: AssetActionScopeInput): string {
  if (input.scope === 'global') {
    if (input.kind === 'character') return 'GlobalCharacter'
    if (input.kind === 'location') return 'GlobalLocation'
    if (input.kind === 'voice') return 'GlobalVoice'
    return 'GlobalAsset'
  }
  if (input.kind === 'character') return 'ProjectCharacter'
  if (input.kind === 'location') return 'ProjectLocation'
  return 'ProjectAsset'
}

function invalidateScopeQueries(queryClient: ReturnType<typeof useQueryClient>, input: AssetActionScopeInput) {
  invalidateByTarget({
    queryClient,
    projectId: input.scope === 'global' ? 'global-asset-hub' : input.projectId ?? '',
    targetType: resolveAssetTargetType(input),
    episodeId: null,
  })
  if (input.scope === 'project' && input.projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.projectData(input.projectId) })
  }
}

export function useRefreshAssets(input: { scope: 'global' | 'project'; projectId?: string | null }) {
  const queryClient = useQueryClient()
  return () => {
    invalidateByTarget({
      queryClient,
      projectId: input.scope === 'global' ? 'global-asset-hub' : input.projectId ?? '',
      targetType: input.scope === 'global' ? 'GlobalAsset' : 'ProjectAsset',
      episodeId: null,
    })
    if (input.scope === 'project' && input.projectId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectData(input.projectId) })
    }
  }
}

export function useAssetActions(input: AssetActionScopeInput) {
  const queryClient = useQueryClient()

  const create = async (payload: Record<string, unknown>) => {
    const response = await apiFetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to create asset')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const remove = async (assetId: string) => {
    const response = await apiFetch(`/api/assets/${assetId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to delete asset')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const update = async (assetId: string, payload: Record<string, unknown>) => {
    const response = await apiFetch(`/api/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to update asset')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const generate = async (payload: Record<string, unknown>) => {
    const assetId = String(payload.id)
    const overlayTarget = resolveGenerateOverlayTarget(input, payload)
    if (overlayTarget) {
      upsertTaskTargetOverlay(queryClient, {
        ...overlayTarget,
        intent: 'generate',
      })
    }

    try {
      const response = await apiFetch(`/api/assets/${assetId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: input.scope,
          kind: input.kind,
          projectId: input.projectId,
          ...payload,
        }),
      })
      if (!response.ok) {
        throw new Error('Failed to generate asset render')
      }
      invalidateScopeQueries(queryClient, input)
      return response.json()
    } catch (error) {
      if (overlayTarget) {
        clearTaskTargetOverlay(queryClient, overlayTarget)
      }
      throw error
    }
  }

  const selectRender = async (payload: Record<string, unknown>) => {
    const response = await apiFetch(`/api/assets/${String(payload.id ?? payload.characterId ?? payload.locationId)}/select-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to select asset render')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const revertRender = async (payload: Record<string, unknown>) => {
    const response = await apiFetch(`/api/assets/${String(payload.id ?? payload.characterId ?? payload.locationId)}/revert-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to revert asset render')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const modifyRender = async (payload: Record<string, unknown>) => {
    const response = await apiFetch(`/api/assets/${String(payload.id ?? payload.characterId ?? payload.locationId)}/modify-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to modify asset render')
    }
    const result = await resolveTaskResponse(response)
    invalidateScopeQueries(queryClient, input)
    return result
  }

  const copyFromGlobal = async (payload: { targetId: string; globalAssetId: string }) => {
    if (input.scope !== 'project' || !input.projectId) {
      throw new Error('copyFromGlobal is only available for project asset scope')
    }
    const response = await apiFetch(`/api/assets/${payload.targetId}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        projectId: input.projectId,
        globalAssetId: payload.globalAssetId,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to copy asset from global library')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const bindVoice = async (payload: Record<string, unknown>) => {
    const characterId = String(payload.characterId)
    const response = await apiFetch(`/api/assets/${characterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: 'character',
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to bind voice')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  const updateVariant = async (assetId: string, variantId: string, payload: Record<string, unknown>) => {
    const response = await apiFetch(`/api/assets/${assetId}/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        kind: input.kind,
        projectId: input.projectId,
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to update asset variant')
    }
    invalidateScopeQueries(queryClient, input)
    return response.json()
  }

  return {
    create,
    update,
    updateVariant,
    remove,
    generate,
    selectRender,
    revertRender,
    modifyRender,
    copyFromGlobal,
    bindVoice,
  }
}
