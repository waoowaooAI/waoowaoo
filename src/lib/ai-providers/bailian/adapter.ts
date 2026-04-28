import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeBailianAudioGeneration } from './audio'
import { executeBailianImageGeneration } from './image'
import { submitBailianLipSync } from './lipsync'
import { runBailianLlmCompletion, runBailianLlmStream, runBailianVisionCompletion } from './llm'
import { resolveBailianOptionSchema } from './models'
import { executeBailianVideoGeneration } from './video'
import {
  createBailianVoiceLineMissingBindingError,
  executeBailianVoiceLineGeneration,
  resolveBailianVoiceLineBinding,
} from './voice-line'

function describeBailianMediaVariant(
  modality: 'image' | 'video' | 'audio',
  selection: Parameters<NonNullable<AiProviderAdapter['image']>['describe']>[0],
) {
  return describeMediaVariantBase({
    modality,
    selection,
    executionMode: modality === 'video' ? 'async' : 'sync',
    optionSchema: resolveBailianOptionSchema(modality),
  })
}

export const bailianAdapter: AiProviderAdapter = {
  providerKey: 'bailian',
  image: {
    describe: (selection) => describeBailianMediaVariant('image', selection),
    execute: executeBailianImageGeneration,
  },
  video: {
    describe: (selection) => describeBailianMediaVariant('video', selection),
    execute: executeBailianVideoGeneration,
  },
  audio: {
    describe: (selection) => describeBailianMediaVariant('audio', selection),
    execute: executeBailianAudioGeneration,
  },
  lipsync: {
    execute: (input) => submitBailianLipSync(input.params, {
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    }),
  },
  voiceLine: {
    resolveBinding: resolveBailianVoiceLineBinding,
    createMissingBindingError: createBailianVoiceLineMissingBindingError,
    execute: executeBailianVoiceLineGeneration,
  },
  completeLlm: (input) => runBailianLlmCompletion({
    modelId: input.selection.modelId,
    messages: input.messages,
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.temperature,
  }),
  languageModel: {
    create: createOpenAiSdkLanguageModel,
  },
  streamLlm: runBailianLlmStream,
  completeVision: runBailianVisionCompletion,
}
