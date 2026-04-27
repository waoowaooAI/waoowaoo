import type OpenAI from 'openai'
import type { GenerateResult } from '@/lib/ai-providers/adapters/media/generators/base'
import type { ProviderConfig, ModelSelection } from '@/lib/api-config'
import type {
  AiLlmExecutionInput,
  AiLlmExecutionResult,
} from '@/lib/ai-registry/types'
import type { ProviderChatCompletionOptions, ProviderChatCompletionStreamCallbacks } from '@/lib/ai-providers/shared/llm-support'

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
  providerConfig: ProviderConfig
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
  selection: ModelSelection
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
  selection: ModelSelection
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
  selection: ModelSelection
  text: string
  options?: {
    voice?: string
    rate?: number
    [key: string]: unknown
  }
}

export interface RegisteredAiProvider {
  readonly providerKey: string
  completeLlm?: (input: AiLlmExecutionInput) => Promise<AiProviderLlmResult>
  streamLlm?: (input: AiProviderLlmStreamContext) => Promise<AiProviderLlmResult>
  completeVision?: (input: AiProviderVisionExecutionContext) => Promise<AiProviderLlmResult>
  executeImage?: (input: AiProviderImageExecutionContext) => Promise<GenerateResult>
  executeVideo?: (input: AiProviderVideoExecutionContext) => Promise<GenerateResult>
  executeAudio?: (input: AiProviderAudioExecutionContext) => Promise<GenerateResult>
}
