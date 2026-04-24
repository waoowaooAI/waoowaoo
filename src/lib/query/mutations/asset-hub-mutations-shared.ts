import type { QueryClient } from '@tanstack/react-query'
import { invalidateByTarget } from '../invalidation/invalidate-by-target'

export const GLOBAL_ASSET_PROJECT_ID = 'global-asset-hub'

export function invalidateGlobalCharacters(queryClient: QueryClient) {
  invalidateByTarget({
    queryClient,
    projectId: GLOBAL_ASSET_PROJECT_ID,
    targetType: 'GlobalCharacter',
    episodeId: null,
  })
}

export function invalidateGlobalLocations(queryClient: QueryClient) {
  invalidateByTarget({
    queryClient,
    projectId: GLOBAL_ASSET_PROJECT_ID,
    targetType: 'GlobalLocation',
    episodeId: null,
  })
}

export function invalidateGlobalVoices(queryClient: QueryClient) {
  invalidateByTarget({
    queryClient,
    projectId: GLOBAL_ASSET_PROJECT_ID,
    targetType: 'GlobalVoice',
    episodeId: null,
  })
}
