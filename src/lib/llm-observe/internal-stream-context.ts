import { AsyncLocalStorage } from 'node:async_hooks'
import type { LLMStreamKind } from './types'

export type InternalLLMStreamStepMeta = {
  id?: string | null
  attempt?: number | null
  title?: string | null
  index?: number | null
  total?: number | null
}

export type InternalLLMStreamCallbacks = {
  onStage?: (stage: {
    stage: 'submit' | 'streaming' | 'fallback' | 'completed'
    provider?: string | null
    step?: InternalLLMStreamStepMeta
  }) => void
  onChunk?: (chunk: {
    kind: LLMStreamKind
    delta: string
    seq: number
    lane?: string | null
    step?: InternalLLMStreamStepMeta
  }) => void
  onComplete?: (text: string, step?: InternalLLMStreamStepMeta) => void
  onError?: (error: unknown, step?: InternalLLMStreamStepMeta) => void
  flush?: () => Promise<void>
}

const llmStreamCallbackStore = new AsyncLocalStorage<InternalLLMStreamCallbacks | null>()

export async function withInternalLLMStreamCallbacks<T>(
  callbacks: InternalLLMStreamCallbacks | null,
  fn: () => Promise<T>,
) {
  return await llmStreamCallbackStore.run(callbacks, fn)
}

export function getInternalLLMStreamCallbacks(): InternalLLMStreamCallbacks | null {
  return llmStreamCallbackStore.getStore() || null
}
