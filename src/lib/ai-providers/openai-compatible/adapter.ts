import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeOpenAiCompatibleImageGeneration } from './image'
import { runOpenAiCompatibleLlmCompletion, runOpenAiCompatibleLlmStream } from './llm'
import { resolveOpenAiCompatibleOptionSchema } from './models'
import { executeOpenAiCompatibleVideoGeneration } from './video'

function describeOpenAiCompatibleMediaVariant(
  modality: 'image' | 'video',
  selection: Parameters<NonNullable<AiProviderAdapter['image']>['describe']>[0],
) {
  const compatTemplate = selection.variantData?.compatMediaTemplate as { mode?: 'sync' | 'async' } | undefined
  return describeMediaVariantBase({
    modality,
    selection,
    executionMode: compatTemplate?.mode === 'async' ? 'async' : 'sync',
    optionSchema: resolveOpenAiCompatibleOptionSchema(modality),
  })
}

function readOpenAiCompatibleLlmProtocol(value: unknown): 'responses' | 'chat-completions' | undefined {
  return value === 'responses' || value === 'chat-completions' ? value : undefined
}

export const openAiCompatibleAdapter: AiProviderAdapter = {
  providerKey: 'openai-compatible',
  image: {
    describe: (selection) => describeOpenAiCompatibleMediaVariant('image', selection),
    execute: executeOpenAiCompatibleImageGeneration,
  },
  video: {
    describe: (selection) => describeOpenAiCompatibleMediaVariant('video', selection),
    execute: executeOpenAiCompatibleVideoGeneration,
  },
  completeLlm: (input) => runOpenAiCompatibleLlmCompletion({
    gatewayRoute: input.providerConfig.gatewayRoute || 'openai-compat',
    userId: input.userId,
    providerId: input.selection.provider,
    modelId: input.selection.modelId,
    llmProtocol: readOpenAiCompatibleLlmProtocol(input.selection.variantData?.llmProtocol),
    providerConfig: input.providerConfig,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    maxRetries: input.maxRetries,
  }),
  languageModel: {
    create: createOpenAiSdkLanguageModel,
  },
  streamLlm: (input) => runOpenAiCompatibleLlmStream({
    ...input,
    gatewayRoute: input.providerConfig.gatewayRoute || 'openai-compat',
  }),
}
