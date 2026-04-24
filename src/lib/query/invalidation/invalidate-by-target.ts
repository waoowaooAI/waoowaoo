import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

export type InvalidateByTargetParams = {
  queryClient: QueryClient
  projectId: string
  targetType: string | null
  episodeId: string | null
  isGlobalAssetProject?: boolean
}

function invalidateEpisodeScoped(params: {
  queryClient: QueryClient
  projectId: string
  episodeId: string | null
}) {
  if (!params.episodeId) return
  params.queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(params.projectId, params.episodeId) })
  params.queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(params.episodeId) })
  params.queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(params.episodeId) })
  params.queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.matched(params.projectId, params.episodeId) })
}

function invalidateGlobalAssetLists(params: {
  queryClient: QueryClient
  kind?: 'character' | 'location' | 'voice' | null
}) {
  params.queryClient.invalidateQueries({ queryKey: queryKeys.assets.all('global') })
  if (params.kind === 'character') {
    params.queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
    return
  }
  if (params.kind === 'location') {
    params.queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
    return
  }
  if (params.kind === 'voice') {
    params.queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.voices() })
    return
  }
  params.queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
}

function invalidateProjectAssetLists(params: {
  queryClient: QueryClient
  projectId: string
  kind?: 'character' | 'location' | null
}) {
  params.queryClient.invalidateQueries({ queryKey: queryKeys.assets.all('project', params.projectId) })
  if (params.kind === 'character') {
    params.queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.characters(params.projectId) })
  } else if (params.kind === 'location') {
    params.queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.locations(params.projectId) })
  }
  params.queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(params.projectId) })
}

export function invalidateByTarget(params: InvalidateByTargetParams) {
  const isGlobalAssetProject = params.isGlobalAssetProject ?? params.projectId === 'global-asset-hub'

  if (isGlobalAssetProject) {
    if (params.targetType?.startsWith('GlobalCharacter')) {
      invalidateGlobalAssetLists({ queryClient: params.queryClient, kind: 'character' })
      return
    }
    if (params.targetType?.startsWith('GlobalLocation')) {
      invalidateGlobalAssetLists({ queryClient: params.queryClient, kind: 'location' })
      return
    }
    if (params.targetType?.startsWith('GlobalVoice')) {
      invalidateGlobalAssetLists({ queryClient: params.queryClient, kind: 'voice' })
      return
    }
    invalidateGlobalAssetLists({ queryClient: params.queryClient })
    return
  }

  if (params.targetType === 'CharacterAppearance' || params.targetType === 'ProjectCharacter') {
    invalidateProjectAssetLists({ queryClient: params.queryClient, projectId: params.projectId, kind: 'character' })
    return
  }
  if (params.targetType === 'LocationImage' || params.targetType === 'ProjectLocation') {
    invalidateProjectAssetLists({ queryClient: params.queryClient, projectId: params.projectId, kind: 'location' })
    return
  }
  if (params.targetType === 'ProjectAsset' || params.targetType === 'ProjectProp') {
    invalidateProjectAssetLists({ queryClient: params.queryClient, projectId: params.projectId })
    return
  }
  if (params.targetType === 'ProjectVoiceLine') {
    invalidateEpisodeScoped(params)
    return
  }
  if (
    params.targetType === 'ProjectPanel' ||
    params.targetType === 'ProjectStoryboard' ||
    params.targetType === 'ProjectShot'
  ) {
    invalidateEpisodeScoped(params)
    return
  }
  if (params.targetType === 'ProjectEpisode') {
    invalidateEpisodeScoped(params)
    params.queryClient.invalidateQueries({ queryKey: queryKeys.projectData(params.projectId) })
    return
  }

  params.queryClient.invalidateQueries({ queryKey: queryKeys.projectData(params.projectId) })
}
