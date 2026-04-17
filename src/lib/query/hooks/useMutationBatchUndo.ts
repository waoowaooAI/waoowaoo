'use client'

import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'

export interface MutationBatchUndoResult {
  ok: boolean
  reverted: number
  error?: string
}

export function useRevertMutationBatch() {
  return useMutation({
    mutationFn: async (batchId: string) => {
      const resolved = batchId.trim()
      if (!resolved) throw new Error('batchId is required')
      const response = await apiFetch(`/api/mutation-batches/${resolved}/revert`, {
        method: 'POST',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(resolveTaskErrorMessage(data, 'Failed to revert mutation batch'))
      }
      return data as MutationBatchUndoResult
    },
  })
}

