import type OpenAI from 'openai'
import type {
  AiLlmExecutionInput,
  AiLlmExecutionResult,
  AiResolvedSelection,
  AiVariantDescriptor,
  AiLlmProviderConfig,
} from '@/lib/ai-registry/types'
import type { ProviderChatCompletionOptions, ProviderChatCompletionStreamCallbacks } from '@/lib/ai-providers/shared/llm-support'

export type GenerateResult = {
  success: boolean
  imageUrl?: string
  imageUrls?: string[]
  imageBase64?: string
  videoUrl?: string
  audioUrl?: string
  error?: string
  requestId?: string
  async?: boolean
  endpoint?: string
  externalId?: string
}

export type AiProviderLlmResult = Pick<
  AiLlmExecutionResult,
  'completion' | 'logProvider' | 'text' | 'reasoning' | 'usage' | 'successDetails'
>

export type AiProviderLlmStreamContext = {
  userId: string
  selection: {
    provider: string
    modelId: string
    modelKey: string
    llmProtocol?: 'responses' | 'chat-completions'
  }
  providerConfig: AiLlmProviderConfig
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  options: ProviderChatCompletionOptions
  callbacks?: ProviderChatCompletionStreamCallbacks
}

export type AiProviderVisionExecutionContext = {
  userId: string
  providerKey: string
  selection: AiLlmExecutionInput['selection']
  providerConfig: AiLlmExecutionInput['providerConfig']
  textPrompt: string
  imageUrls: string[]
  temperature: number
  reasoning: boolean
}

export type AiProviderImageExecutionContext = {
  userId: string
  selection: AiResolvedSelection & {
    provider: string
    modelId: string
    modelKey: string
    compatMediaTemplate?: unknown
  }
  prompt: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    resolution?: string
    outputFormat?: string
    keepOriginalAspectRatio?: boolean
    size?: string
    quality?: string
    responseFormat?: string
    [key: string]: unknown
  }
}

export type AiProviderVideoExecutionContext = {
  userId: string
  selection: AiResolvedSelection & {
    provider: string
    modelId: string
    modelKey: string
    compatMediaTemplate?: unknown
  }
  imageUrl: string
  options?: {
    prompt?: string
    duration?: number
    fps?: number
    resolution?: string
    aspectRatio?: string
    generateAudio?: boolean
    lastFrameImageUrl?: string
    [key: string]: unknown
  }
}

export type AiProviderAudioExecutionContext = {
  userId: string
  selection: AiResolvedSelection & {
    provider: string
    modelId: string
    modelKey: string
  }
  text: string
  options?: {
    voice?: string
    rate?: number
    [key: string]: unknown
  }
}

export type RegisteredMediaProviderModalityAdapter<M extends 'image' | 'video' | 'audio'> = {
  describe: (selection: AiResolvedSelection) => AiVariantDescriptor
  execute: (
    input: M extends 'image'
      ? AiProviderImageExecutionContext
      : M extends 'video'
        ? AiProviderVideoExecutionContext
        : AiProviderAudioExecutionContext,
  ) => Promise<GenerateResult>
}

export interface RegisteredAiProvider {
  readonly providerKey: string
  image?: RegisteredMediaProviderModalityAdapter<'image'>
  video?: RegisteredMediaProviderModalityAdapter<'video'>
  audio?: RegisteredMediaProviderModalityAdapter<'audio'>
  completeLlm?: (input: AiLlmExecutionInput) => Promise<AiProviderLlmResult>
  streamLlm?: (input: AiProviderLlmStreamContext) => Promise<AiProviderLlmResult>
  completeVision?: (input: AiProviderVisionExecutionContext) => Promise<AiProviderLlmResult>
  executeImage?: (input: AiProviderImageExecutionContext) => Promise<GenerateResult>
  executeVideo?: (input: AiProviderVideoExecutionContext) => Promise<GenerateResult>
  executeAudio?: (input: AiProviderAudioExecutionContext) => Promise<GenerateResult>
}
