import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { invalidateQueryTemplates } from './mutation-shared'

export const GLOBAL_ASSET_PROJECT_ID = 'global-asset-hub'

export function invalidateGlobalCharacters(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [queryKeys.globalAssets.characters()])
}

export function invalidateGlobalLocations(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [queryKeys.globalAssets.locations()])
}

export function invalidateGlobalVoices(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [queryKeys.globalAssets.voices()])
}
