import type OpenAI from 'openai'
import type { LanguageModel } from 'ai'
import type {
  AiLlmExecutionInput,
  AiLlmExecutionResult,
  AiResolvedSelection,
  AiVariantDescriptor,
  AiLlmProviderConfig,
  AiLipSyncParams,
  AiLipSyncResult,
} from '@/lib/ai-registry/types'
import type { ProviderChatCompletionOptions, ProviderChatCompletionStreamCallbacks } from '@/lib/ai-providers/shared/llm-support'
import type {
  CharacterVoiceFields,
  SpeakerVoiceEntry,
  VoiceLineBindingSource,
} from '@/lib/ai-providers/shared/voice-line-binding'

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

export type AiProviderLanguageModelContext = {
  providerKey: string
  selection: {
    provider: string
    modelId: string
    modelKey: string
  }
  providerConfig: AiLlmProviderConfig
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

export type AiProviderLipSyncExecutionContext = {
  userId: string
  selection: AiResolvedSelection & {
    provider: string
    modelId: string
    modelKey: string
  }
  params: AiLipSyncParams
}

export type AiProviderVoiceLineBinding =
  | {
    provider: 'fal'
    source: VoiceLineBindingSource
    referenceAudioUrl: string
  }
  | {
    provider: 'bailian'
    source: VoiceLineBindingSource
    voiceId: string
  }

export type AiProviderVoiceLineBindingInput = {
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}

export type AiProviderVoiceLineExecutionContext = {
  userId: string
  selection: AiResolvedSelection & {
    provider: string
    modelId: string
    modelKey: string
  }
  text: string
  emotionPrompt?: string | null
  emotionStrength?: number | null
  binding: AiProviderVoiceLineBinding
}

export type AiProviderVoiceLineResult = {
  audioData: Buffer
  audioDuration: number
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

export type RegisteredLipSyncProviderModalityAdapter = {
  execute: (input: AiProviderLipSyncExecutionContext) => Promise<AiLipSyncResult>
}

export type RegisteredVoiceLineProviderModalityAdapter = {
  resolveBinding: (input: AiProviderVoiceLineBindingInput) => AiProviderVoiceLineBinding | null
  createMissingBindingError: (input: AiProviderVoiceLineBindingInput) => Error
  execute: (input: AiProviderVoiceLineExecutionContext) => Promise<AiProviderVoiceLineResult>
}

export type RegisteredLanguageModelProviderAdapter = {
  create: (input: AiProviderLanguageModelContext) => LanguageModel
}

export interface RegisteredAiProvider {
  readonly providerKey: string
  image?: RegisteredMediaProviderModalityAdapter<'image'>
  video?: RegisteredMediaProviderModalityAdapter<'video'>
  audio?: RegisteredMediaProviderModalityAdapter<'audio'>
  lipsync?: RegisteredLipSyncProviderModalityAdapter
  voiceLine?: RegisteredVoiceLineProviderModalityAdapter
  languageModel?: RegisteredLanguageModelProviderAdapter
  completeLlm?: (input: AiLlmExecutionInput) => Promise<AiProviderLlmResult>
  streamLlm?: (input: AiProviderLlmStreamContext) => Promise<AiProviderLlmResult>
  completeVision?: (input: AiProviderVisionExecutionContext) => Promise<AiProviderLlmResult>
  executeImage?: (input: AiProviderImageExecutionContext) => Promise<GenerateResult>
  executeVideo?: (input: AiProviderVideoExecutionContext) => Promise<GenerateResult>
  executeAudio?: (input: AiProviderAudioExecutionContext) => Promise<GenerateResult>
}
