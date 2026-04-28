import { AiRegistry } from '@/lib/ai-registry/registry'
import { resolveAiGatewayRoute } from '@/lib/ai-registry/gateway-route'
import type { AiLlmProviderConfig } from '@/lib/ai-registry/types'
import {
  registerBuiltinCapabilityCatalogEntries,
  registerBuiltinPricingCatalogEntries,
} from '@/lib/ai-registry/catalog'
import { arkMediaAdapter } from '@/lib/ai-providers/ark/adapter'
import { executeArkImageGeneration } from '@/lib/ai-providers/ark/image'
import { runArkLlmCompletion, runArkLlmStream, runArkVisionCompletion } from '@/lib/ai-providers/ark/llm'
import { executeArkVideoGeneration } from '@/lib/ai-providers/ark/video'
import { ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES, ARK_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/ark/models'
import { bailianMediaAdapter } from '@/lib/ai-providers/bailian/adapter'
import {
  executeBailianAudioGeneration,
  executeBailianImageGeneration,
  executeBailianVideoGeneration,
  runBailianLlmCompletion,
  runBailianLlmStream,
  runBailianVisionCompletion,
} from '@/lib/ai-providers/bailian'
import { BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES, BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/bailian/models'
import { falMediaAdapter } from '@/lib/ai-providers/fal/adapter'
import { executeFalImageGeneration } from '@/lib/ai-providers/fal/image'
import { executeFalVideoGeneration } from '@/lib/ai-providers/fal/video'
import { FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES, FAL_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/fal/models'
import { geminiCompatibleMediaAdapter, googleMediaAdapter } from '@/lib/ai-providers/google/adapter'
import { executeGoogleImageGeneration } from '@/lib/ai-providers/google/image'
import { runGoogleLlmCompletion, runGoogleLlmStream, runGoogleVisionCompletion } from '@/lib/ai-providers/google/llm'
import { executeGoogleVideoGeneration } from '@/lib/ai-providers/google/video'
import { GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES, GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/google/models'
import { minimaxMediaAdapter } from '@/lib/ai-providers/minimax/adapter'
import { executeMinimaxVideoGeneration } from '@/lib/ai-providers/minimax/video'
import { MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES, MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/minimax/models'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { executeOpenAiCompatibleImageGeneration } from '@/lib/ai-providers/openai-compatible/image'
import { runOpenAiCompatibleLlmCompletion, runOpenAiCompatibleLlmStream } from '@/lib/ai-providers/openai-compatible/llm'
import { executeOpenAiCompatibleVideoGeneration } from '@/lib/ai-providers/openai-compatible/video'
import { OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES, OPENAI_COMPATIBLE_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/openai-compatible/models'
import { openRouterMediaAdapter } from '@/lib/ai-providers/openrouter/adapter'
import { runOpenRouterLlmCompletion, runOpenRouterLlmStream } from '@/lib/ai-providers/openrouter/llm'
import { OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES, OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/openrouter/models'
import { siliconFlowMediaAdapter } from '@/lib/ai-providers/siliconflow/adapter'
import {
  executeSiliconFlowAudioGeneration,
  executeSiliconFlowImageGeneration,
  executeSiliconFlowVideoGeneration,
  runSiliconFlowLlmCompletion,
  runSiliconFlowLlmStream,
  runSiliconFlowVisionCompletion,
} from '@/lib/ai-providers/siliconflow'
import { SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES, SILICONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/siliconflow/models'
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'
import { executeViduVideoGeneration } from '@/lib/ai-providers/vidu/video'
import { VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES, VIDU_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/vidu/models'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
import type { RegisteredAiProvider } from '@/lib/ai-providers/runtime-types'

registerBuiltinCapabilityCatalogEntries([
  ...ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
])

registerBuiltinPricingCatalogEntries([
  ...ARK_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...FAL_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...OPENAI_COMPATIBLE_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...SILICONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES,
  ...VIDU_BUILTIN_PRICING_CATALOG_ENTRIES,
])

const mediaAdapterRegistry = new AiRegistry<DescribeOnlyMediaAdapter>([
  bailianMediaAdapter,
  siliconFlowMediaAdapter,
  openAiCompatibleMediaAdapter,
  openRouterMediaAdapter,
  googleMediaAdapter,
  geminiCompatibleMediaAdapter,
  arkMediaAdapter,
  falMediaAdapter,
  minimaxMediaAdapter,
  viduMediaAdapter,
])

function getProviderKey(providerId: string): string {
  const marker = providerId.indexOf(':')
  return (marker === -1 ? providerId : providerId.slice(0, marker)).toLowerCase()
}

const runtimeProviderRegistry = new AiRegistry<RegisteredAiProvider>([
  {
    providerKey: 'ark',
    image: {
      describe: (selection) => arkMediaAdapter.describeVariant('image', selection),
      execute: executeArkImageGeneration,
    },
    video: {
      describe: (selection) => arkMediaAdapter.describeVariant('video', selection),
      execute: executeArkVideoGeneration,
    },
    completeLlm: (input) => runArkLlmCompletion({
      apiKey: input.providerConfig.apiKey,
      modelId: input.selection.modelId,
      messages: input.messages,
      reasoning: input.reasoning,
    }),
    streamLlm: runArkLlmStream,
    completeVision: runArkVisionCompletion,
  },
  {
    providerKey: 'bailian',
    image: {
      describe: (selection) => bailianMediaAdapter.describeVariant('image', selection),
      execute: executeBailianImageGeneration,
    },
    video: {
      describe: (selection) => bailianMediaAdapter.describeVariant('video', selection),
      execute: executeBailianVideoGeneration,
    },
    audio: {
      describe: (selection) => bailianMediaAdapter.describeVariant('audio', selection),
      execute: executeBailianAudioGeneration,
    },
    completeLlm: (input) => runBailianLlmCompletion({
      modelId: input.selection.modelId,
      messages: input.messages,
      apiKey: input.providerConfig.apiKey,
      baseUrl: input.providerConfig.baseUrl,
      temperature: input.temperature,
    }),
    streamLlm: runBailianLlmStream,
    completeVision: runBailianVisionCompletion,
  },
  {
    providerKey: 'fal',
    image: {
      describe: (selection) => falMediaAdapter.describeVariant('image', selection),
      execute: executeFalImageGeneration,
    },
    video: {
      describe: (selection) => falMediaAdapter.describeVariant('video', selection),
      execute: executeFalVideoGeneration,
    },
  },
  {
    providerKey: 'google',
    image: {
      describe: (selection) => googleMediaAdapter.describeVariant('image', selection),
      execute: executeGoogleImageGeneration,
    },
    video: {
      describe: (selection) => googleMediaAdapter.describeVariant('video', selection),
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
    streamLlm: runGoogleLlmStream,
    completeVision: runGoogleVisionCompletion,
  },
  {
    providerKey: 'gemini-compatible',
    image: {
      describe: (selection) => geminiCompatibleMediaAdapter.describeVariant('image', selection),
      execute: executeGoogleImageGeneration,
    },
    video: {
      describe: (selection) => geminiCompatibleMediaAdapter.describeVariant('video', selection),
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
    streamLlm: runGoogleLlmStream,
    completeVision: runGoogleVisionCompletion,
  },
  {
    providerKey: 'minimax',
    video: {
      describe: (selection) => minimaxMediaAdapter.describeVariant('video', selection),
      execute: executeMinimaxVideoGeneration,
    },
  },
  {
    providerKey: 'openai-compatible',
    image: {
      describe: (selection) => openAiCompatibleMediaAdapter.describeVariant('image', selection),
      execute: executeOpenAiCompatibleImageGeneration,
    },
    video: {
      describe: (selection) => openAiCompatibleMediaAdapter.describeVariant('video', selection),
      execute: executeOpenAiCompatibleVideoGeneration,
    },
    completeLlm: (input) => runOpenAiCompatibleLlmCompletion({
      gatewayRoute: input.providerConfig.gatewayRoute || 'openai-compat',
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      llmProtocol: input.selection.llmProtocol,
      providerConfig: input.providerConfig,
      messages: input.messages,
      temperature: input.temperature,
      reasoning: input.reasoning,
      reasoningEffort: input.reasoningEffort,
      maxRetries: input.maxRetries,
    }),
    streamLlm: (input) => runOpenAiCompatibleLlmStream({
      ...input,
      gatewayRoute: input.providerConfig.gatewayRoute || 'openai-compat',
    }),
  },
  {
    providerKey: 'openrouter',
    completeLlm: (input) => runOpenRouterLlmCompletion({
      modelId: input.selection.modelId,
      providerConfig: input.providerConfig,
      messages: input.messages,
      temperature: input.temperature,
      reasoning: input.reasoning,
      reasoningEffort: input.reasoningEffort,
      maxRetries: input.maxRetries,
    }),
    streamLlm: runOpenRouterLlmStream,
  },
  {
    providerKey: 'siliconflow',
    image: {
      describe: (selection) => siliconFlowMediaAdapter.describeVariant('image', selection),
      execute: executeSiliconFlowImageGeneration,
    },
    video: {
      describe: (selection) => siliconFlowMediaAdapter.describeVariant('video', selection),
      execute: executeSiliconFlowVideoGeneration,
    },
    audio: {
      describe: (selection) => siliconFlowMediaAdapter.describeVariant('audio', selection),
      execute: executeSiliconFlowAudioGeneration,
    },
    completeLlm: (input) => runSiliconFlowLlmCompletion({
      modelId: input.selection.modelId,
      messages: input.messages,
      apiKey: input.providerConfig.apiKey,
      baseUrl: input.providerConfig.baseUrl,
      temperature: input.temperature,
    }),
    streamLlm: runSiliconFlowLlmStream,
    completeVision: runSiliconFlowVisionCompletion,
  },
  {
    providerKey: 'vidu',
    video: {
      describe: (selection) => viduMediaAdapter.describeVariant('video', selection),
      execute: executeViduVideoGeneration,
    },
  },
])

export function resolveRegisteredAiProvider(providerId: string): RegisteredAiProvider {
  return runtimeProviderRegistry.getAdapterByProviderId(providerId)
}

export function resolveRegisteredMediaAdapter(providerId: string): DescribeOnlyMediaAdapter {
  return mediaAdapterRegistry.getAdapterByProviderId(providerId)
}

export function resolveRegisteredMediaGatewayRoute(input: {
  providerId: string
  providerConfig: AiLlmProviderConfig
}): 'official' | 'openai-compat' {
  const providerKey = getProviderKey(input.providerId)
  const defaultGatewayRoute = resolveAiGatewayRoute(input.providerId)
  if (providerKey === 'gemini-compatible') {
    return input.providerConfig.apiMode === 'openai-official' ? 'openai-compat' : 'official'
  }
  if (providerKey === 'bailian' || providerKey === 'siliconflow') {
    return 'official'
  }
  return input.providerConfig.gatewayRoute || defaultGatewayRoute
}

export function shouldUseRegisteredVideoExecution(input: {
  providerId: string
  gatewayRoute: 'official' | 'openai-compat'
}): boolean {
  const providerKey = getProviderKey(input.providerId).toLowerCase()
  return input.gatewayRoute === 'openai-compat'
    || providerKey === 'bailian'
    || providerKey === 'siliconflow'
}

export function shouldUseRegisteredImageExecution(input: {
  providerId: string
  gatewayRoute: 'official' | 'openai-compat'
}): boolean {
  const providerKey = getProviderKey(input.providerId).toLowerCase()
  return input.gatewayRoute === 'openai-compat'
    || providerKey === 'bailian'
    || providerKey === 'siliconflow'
}
