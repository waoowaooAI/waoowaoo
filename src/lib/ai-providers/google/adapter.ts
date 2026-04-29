import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { buildMediaOptionSchema } from '@/lib/ai-providers/shared/option-schema'
import { executeGeminiCompatibleImageGeneration, executeGoogleImageGeneration } from './image'
import { createGoogleSdkLanguageModel } from './language-model'
import { runGoogleLlmCompletion, runGoogleLlmStream, runGoogleVisionCompletion } from './llm'
import { executeGoogleVideoGeneration } from './video'

function describeGoogleMediaVariant(
  modality: 'image' | 'video',
  selection: Parameters<NonNullable<AiProviderAdapter['image']>['describe']>[0],
) {
  const executionMode = modality === 'image' && selection.modelId === 'gemini-3-pro-image-preview-batch'
    ? 'batch'
    : modality === 'video'
      ? 'async'
      : 'sync'
  return describeMediaVariantBase({
    modality,
    selection,
    executionMode,
    optionSchema: buildMediaOptionSchema(modality),
  })
}

function describeGeminiCompatibleMediaVariant(
  modality: 'image' | 'video',
  selection: Parameters<NonNullable<AiProviderAdapter['image']>['describe']>[0],
) {
  return describeMediaVariantBase({
    modality,
    selection,
    executionMode: modality === 'video' ? 'async' : 'sync',
    optionSchema: buildMediaOptionSchema(modality),
  })
}

export const googleAdapter: AiProviderAdapter = {
  providerKey: 'google',
  image: {
    describe: (selection) => describeGoogleMediaVariant('image', selection),
    execute: executeGoogleImageGeneration,
  },
  video: {
    describe: (selection) => describeGoogleMediaVariant('video', selection),
    execute: executeGoogleVideoGeneration,
  },
  completeLlm: (input) => runGoogleLlmCompletion({
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    modelId: input.selection.modelId,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    logProvider: 'google',
  }),
  languageModel: {
    create: createGoogleSdkLanguageModel,
  },
  streamLlm: runGoogleLlmStream,
  completeVision: runGoogleVisionCompletion,
}

export const geminiCompatibleAdapter: AiProviderAdapter = {
  providerKey: 'gemini-compatible',
  image: {
    describe: (selection) => describeGeminiCompatibleMediaVariant('image', selection),
    execute: executeGeminiCompatibleImageGeneration,
  },
  video: {
    describe: (selection) => describeGeminiCompatibleMediaVariant('video', selection),
    execute: executeGoogleVideoGeneration,
  },
  completeLlm: (input) => runGoogleLlmCompletion({
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    modelId: input.selection.modelId,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    logProvider: 'gemini-compatible',
  }),
  languageModel: {
    create: createGoogleSdkLanguageModel,
  },
  streamLlm: runGoogleLlmStream,
  completeVision: runGoogleVisionCompletion,
}
