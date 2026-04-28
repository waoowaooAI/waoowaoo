import type OpenAI from 'openai'

import { getCompletionParts as getCompletionPartsInternal } from '@/lib/ai-providers/shared/completion-parts'
import {
  chatCompletion,
  chatCompletionStream,
  chatCompletionWithVision,
  chatCompletionWithVisionStream,
} from '@/lib/ai-exec/engine'
import type { LLMStreamKind } from '@/lib/llm-observe/types'
import type { InternalLLMStreamStepMeta } from '@/lib/llm-observe/internal-stream-context'

export interface ChatCompletionOptions {
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries?: number
  projectId?: string
  action?: string
  streamStepId?: string
  streamStepAttempt?: number
  streamStepTitle?: string
  streamStepIndex?: number
  streamStepTotal?: number
  __skipAutoStream?: boolean
}

export interface ChatCompletionStreamCallbacks {
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
}

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }

export {
  chatCompletion,
  chatCompletionStream,
  chatCompletionWithVision,
  chatCompletionWithVisionStream,
}

export function getCompletionParts(completion: OpenAI.Chat.Completions.ChatCompletion): {
  text: string
  reasoning: string
} {
  return getCompletionPartsInternal(completion)
}

export function getCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  return getCompletionParts(completion).text
}

