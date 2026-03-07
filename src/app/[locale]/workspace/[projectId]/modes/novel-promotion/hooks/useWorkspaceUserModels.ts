'use client'

import { useEffect, useMemo } from 'react'
import { logError as _ulogError } from '@/lib/logging/core'
import { useUserModels } from '@/lib/query/hooks'
import type { ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'

export interface UserModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

export interface UserModelsPayload {
  llm: UserModelOption[]
  image: UserModelOption[]
  video: UserModelOption[]
  audio: UserModelOption[]
  lipsync: UserModelOption[]
}

export function useWorkspaceUserModels() {
  const userModelsQuery = useUserModels()
  const userModelsForSettings = (userModelsQuery.data || null) as UserModelsPayload | null
  const userVideoModels = useMemo<UserModelOption[]>(() => {
    if (!userModelsForSettings || !Array.isArray(userModelsForSettings.video)) return []
    return userModelsForSettings.video
  }, [userModelsForSettings])
  const userModelsLoaded = userModelsQuery.isFetched

  useEffect(() => {
    if (userModelsQuery.error) {
      _ulogError('Failed to fetch user models:', userModelsQuery.error)
    }
  }, [userModelsQuery.error])

  return {
    userModelsForSettings,
    userVideoModels,
    userModelsLoaded,
  }
}
