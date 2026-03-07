import type { LLMStreamKind } from '@/lib/llm-observe/types'
import type { InternalLLMStreamStepMeta } from '@/lib/llm-observe/internal-stream-context'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'

export function resolveStreamStepMeta(options: ChatCompletionOptions): InternalLLMStreamStepMeta | undefined {
    const id = typeof options.streamStepId === 'string' ? options.streamStepId.trim() : ''
    const attempt = typeof options.streamStepAttempt === 'number' && Number.isFinite(options.streamStepAttempt)
        ? Math.max(1, Math.floor(options.streamStepAttempt))
        : null
    const title = typeof options.streamStepTitle === 'string' ? options.streamStepTitle.trim() : ''
    const index = typeof options.streamStepIndex === 'number' && Number.isFinite(options.streamStepIndex)
        ? Math.max(1, Math.floor(options.streamStepIndex))
        : null
    const total = typeof options.streamStepTotal === 'number' && Number.isFinite(options.streamStepTotal)
        ? Math.max(1, Math.floor(options.streamStepTotal))
        : null

    if (!id && !attempt && !title && !index && !total) return undefined
    return {
        ...(id ? { id } : {}),
        ...(attempt ? { attempt } : {}),
        ...(title ? { title } : {}),
        ...(index ? { index } : {}),
        ...(total ? { total: Math.max(index || 1, total) } : {}),
    }
}

export function emitStreamStage(
    callbacks: ChatCompletionStreamCallbacks | undefined,
    step: InternalLLMStreamStepMeta | undefined,
    stage: 'submit' | 'streaming' | 'fallback' | 'completed',
    provider?: string | null,
) {
    callbacks?.onStage?.({ stage, provider, ...(step ? { step } : {}) })
}

export function emitStreamChunk(
    callbacks: ChatCompletionStreamCallbacks | undefined,
    step: InternalLLMStreamStepMeta | undefined,
    chunk: {
        kind: LLMStreamKind
        delta: string
        seq: number
        lane?: string | null
    },
) {
    callbacks?.onChunk?.({
        ...chunk,
        ...(step ? { step } : {}),
    })
}

export function emitChunkedText(
    text: string,
    callbacks?: ChatCompletionStreamCallbacks,
    kind: LLMStreamKind = 'text',
    seqStart = 1,
    step?: InternalLLMStreamStepMeta,
) {
    if (!text) return seqStart
    let seq = seqStart
    const chunkSize = 320
    for (let i = 0; i < text.length; i += chunkSize) {
        emitStreamChunk(callbacks, step, {
            kind,
            delta: text.slice(i, i + chunkSize),
            seq,
            lane: 'main',
        })
        seq += 1
    }
    return seq
}
