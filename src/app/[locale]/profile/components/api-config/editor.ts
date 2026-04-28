'use client'

import { apiFetch } from '@/lib/api-fetch'
import type { CapabilitySelections } from '@/lib/ai-registry/types'
import type { CustomModel, Provider } from './types'
import type { DefaultModels, WorkflowConcurrency } from './selectors'
import type { MutableRefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
import { logError as _ulogError } from '@/lib/logging/core'

export function useApiConfigSaver(input: {
  latestModelsRef: MutableRefObject<CustomModel[]>
  latestProvidersRef: MutableRefObject<Provider[]>
  latestDefaultModelsRef: MutableRefObject<DefaultModels>
  latestWorkflowConcurrencyRef: MutableRefObject<WorkflowConcurrency>
  latestCapabilityDefaultsRef: MutableRefObject<CapabilitySelections>
}): {
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  performSave: (overrides?: {
    defaultModels?: DefaultModels
    workflowConcurrency?: WorkflowConcurrency
    capabilityDefaults?: CapabilitySelections
  }, silent?: boolean) => Promise<boolean>
  flushConfig: () => Promise<void>
} {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const performSave = useCallback(async (
    overrides?: {
      defaultModels?: DefaultModels
      workflowConcurrency?: WorkflowConcurrency
      capabilityDefaults?: CapabilitySelections
    },
    silent = false,
  ): Promise<boolean> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    if (!silent) setSaveStatus('saving')

    try {
      const currentModels = input.latestModelsRef.current
      const currentProviders = input.latestProvidersRef.current
      const currentDefaultModels = overrides?.defaultModels ?? input.latestDefaultModelsRef.current
      const currentWorkflowConcurrency = overrides?.workflowConcurrency ?? input.latestWorkflowConcurrencyRef.current
      const currentCapabilityDefaults = overrides?.capabilityDefaults ?? input.latestCapabilityDefaultsRef.current
      const enabledModels = currentModels.filter((model) => model.enabled)

      const res = await apiFetch('/api/user/api-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: enabledModels,
          providers: currentProviders,
          defaultModels: currentDefaultModels,
          workflowConcurrency: currentWorkflowConcurrency,
          capabilityDefaults: currentCapabilityDefaults,
        }),
      })
      if (!res.ok) {
        if (!silent) setSaveStatus('error')
        return false
      }

      if (!silent) {
        setSaveStatus('saved')
        saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
      }
      return true
    } catch (error) {
      _ulogError('保存失败:', error)
      if (!silent) setSaveStatus('error')
      return false
    }
  }, [input.latestCapabilityDefaultsRef, input.latestDefaultModelsRef, input.latestModelsRef, input.latestProvidersRef, input.latestWorkflowConcurrencyRef])

  const flushConfig = useCallback(async () => {
    const success = await performSave(undefined, true)
    if (!success) {
      throw new Error('API_CONFIG_FLUSH_FAILED')
    }
  }, [performSave])

  return { saveStatus, performSave, flushConfig }
}
