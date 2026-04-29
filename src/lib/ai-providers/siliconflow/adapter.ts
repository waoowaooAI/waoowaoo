import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeSiliconFlowAudioGeneration } from './audio'
import { executeSiliconFlowImageGeneration } from './image'
import { runSiliconFlowLlmCompletion, runSiliconFlowLlmStream, runSiliconFlowVisionCompletion } from './llm'
import { resolveSiliconFlowOptionSchema } from './models'
import { executeSiliconFlowVideoGeneration } from './video'

function describeSiliconFlowMediaVariant(
  modality: 'image' | 'video' | 'audio',
  selection: Parameters<NonNullable<AiProviderAdapter['image']>['describe']>[0],
) {
  return describeMediaVariantBase({
    modality,
    selection,
    executionMode: modality === 'video' ? 'async' : 'sync',
    optionSchema: resolveSiliconFlowOptionSchema(modality),
  })
}

export const siliconFlowAdapter: AiProviderAdapter = {
  providerKey: 'siliconflow',
  image: {
    describe: (selection) => describeSiliconFlowMediaVariant('image', selection),
    execute: executeSiliconFlowImageGeneration,
  },
  video: {
    describe: (selection) => describeSiliconFlowMediaVariant('video', selection),
    execute: executeSiliconFlowVideoGeneration,
  },
  audio: {
    describe: (selection) => describeSiliconFlowMediaVariant('audio', selection),
    execute: executeSiliconFlowAudioGeneration,
  },
  completeLlm: (input) => runSiliconFlowLlmCompletion({
    modelId: input.selection.modelId,
    messages: input.messages,
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.temperature,
  }),
  languageModel: {
    create: createOpenAiSdkLanguageModel,
  },
  streamLlm: runSiliconFlowLlmStream,
  completeVision: runSiliconFlowVisionCompletion,
}
