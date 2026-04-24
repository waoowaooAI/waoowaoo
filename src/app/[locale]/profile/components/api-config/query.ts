'use client'

import { apiFetch } from '@/lib/api-fetch'
import { useCallback, useEffect, useState } from 'react'
import type { ApiConfig } from './types'

export async function fetchUserApiConfig(): Promise<ApiConfig> {
  const res = await apiFetch('/api/user/api-config')
  if (!res.ok) {
    throw new Error(`api-config load failed: HTTP ${res.status}`)
  }
  const data = await res.json() as ApiConfig
  if (!data.catalog) {
    throw new Error('API_CONFIG_CATALOG_MISSING')
  }
  return data
}

export function useUserApiConfigQuery(): {
  data: ApiConfig | null
  loading: boolean
  error: Error | null
  reload: () => Promise<void>
} {
  const [data, setData] = useState<ApiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchUserApiConfig()
      setData(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('API_CONFIG_QUERY_FAILED'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}

