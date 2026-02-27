'use client'

import { useQuery } from '@tanstack/react-query'
import type { ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import { queryKeys } from '../keys'

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

export function useUserModels() {
    return useQuery({
        queryKey: queryKeys.userModels.all(),
        queryFn: async () => {
            const response = await fetch('/api/user/models')
            if (!response.ok) {
                throw new Error('Failed to fetch user models')
            }
            const data = await response.json()
            return {
                llm: Array.isArray(data?.llm) ? data.llm : [],
                image: Array.isArray(data?.image) ? data.image : [],
                video: Array.isArray(data?.video) ? data.video : [],
                audio: Array.isArray(data?.audio) ? data.audio : [],
                lipsync: Array.isArray(data?.lipsync) ? data.lipsync : [],
            } as UserModelsPayload
        },
    })
}
