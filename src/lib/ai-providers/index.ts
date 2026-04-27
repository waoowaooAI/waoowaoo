import { AiRegistry } from '@/lib/ai-registry/registry'
import { getProviderKey, type ProviderConfig } from '@/lib/api-config'
import { resolveAiGatewayRoute } from '@/lib/ai-registry/gateway-route'
import { arkMediaAdapter } from '@/lib/ai-providers/ark/adapter'
import { executeArkImageGeneration } from '@/lib/ai-providers/ark/image'
import { runArkLlmCompletion, runArkLlmStream, runArkVisionCompletion } from '@/lib/ai-providers/ark/llm'
import { executeArkVideoGeneration } from '@/lib/ai-providers/ark/video'
import { bailianMediaAdapter } from '@/lib/ai-providers/bailian/adapter'
import {
  executeBailianAudioGeneration,
  executeBailianImageGeneration,
  executeBailianVideoGeneration,
  runBailianLlmCompletion,
  runBailianLlmStream,
  runBailianVisionCompletion,
} from '@/lib/ai-providers/bailian'
import { falMediaAdapter } from '@/lib/ai-providers/fal/adapter'
import { executeFalImageGeneration } from '@/lib/ai-providers/fal/image'
import { executeFalVideoGeneration } from '@/lib/ai-providers/fal/video'
import { geminiCompatibleMediaAdapter, googleMediaAdapter } from '@/lib/ai-providers/google/adapter'
import { executeGoogleImageGeneration } from '@/lib/ai-providers/google/image'
import { runGoogleLlmCompletion, runGoogleLlmStream, runGoogleVisionCompletion } from '@/lib/ai-providers/google/llm'
import { executeGoogleVideoGeneration } from '@/lib/ai-providers/google/video'
import { minimaxMediaAdapter } from '@/lib/ai-providers/minimax/adapter'
import { executeMinimaxVideoGeneration } from '@/lib/ai-providers/minimax/video'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { executeOpenAiCompatibleImageGeneration } from '@/lib/ai-providers/openai-compatible/image'
import { runOpenAiCompatibleLlmCompletion, runOpenAiCompatibleLlmStream } from '@/lib/ai-providers/openai-compatible/llm'
import { executeOpenAiCompatibleVideoGeneration } from '@/lib/ai-providers/openai-compatible/video'
import { openRouterMediaAdapter } from '@/lib/ai-providers/openrouter/adapter'
import { runOpenRouterLlmCompletion, runOpenRouterLlmStream } from '@/lib/ai-providers/openrouter/llm'
import { siliconFlowMediaAdapter } from '@/lib/ai-providers/siliconflow/adapter'
import {
  executeSiliconFlowAudioGeneration,
  executeSiliconFlowImageGeneration,
  executeSiliconFlowVideoGeneration,
  runSiliconFlowLlmCompletion,
  runSiliconFlowLlmStream,
  runSiliconFlowVisionCompletion,
} from '@/lib/ai-providers/siliconflow'
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'
import { executeViduVideoGeneration } from '@/lib/ai-providers/vidu/video'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
import type { RegisteredAiProvider } from '@/lib/ai-providers/runtime-types'

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

const runtimeProviderRegistry = new AiRegistry<RegisteredAiProvider>([
  {
    providerKey: 'ark',
    completeLlm: (input) => runArkLlmCompletion({
      apiKey: input.providerConfig.apiKey,
      modelId: input.selection.modelId,
      messages: input.messages,
      reasoning: input.reasoning,
    }),
    streamLlm: runArkLlmStream,
    completeVision: runArkVisionCompletion,
    executeImage: executeArkImageGeneration,
    executeVideo: executeArkVideoGeneration,
  },
  {
    providerKey: 'bailian',
    completeLlm: (input) => runBailianLlmCompletion({
      modelId: input.selection.modelId,
      messages: input.messages,
      apiKey: input.providerConfig.apiKey,
      baseUrl: input.providerConfig.baseUrl,
      temperature: input.temperature,
    }),
    streamLlm: runBailianLlmStream,
    completeVision: runBailianVisionCompletion,
    executeImage: executeBailianImageGeneration,
    executeVideo: executeBailianVideoGeneration,
    executeAudio: executeBailianAudioGeneration,
  },
  {
    providerKey: 'fal',
    executeImage: executeFalImageGeneration,
    executeVideo: executeFalVideoGeneration,
  },
  {
    providerKey: 'google',
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
    executeImage: executeGoogleImageGeneration,
    executeVideo: executeGoogleVideoGeneration,
  },
  {
    providerKey: 'gemini-compatible',
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
    executeImage: executeGoogleImageGeneration,
    executeVideo: executeGoogleVideoGeneration,
  },
  {
    providerKey: 'minimax',
    executeVideo: executeMinimaxVideoGeneration,
  },
  {
    providerKey: 'openai-compatible',
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
    executeImage: executeOpenAiCompatibleImageGeneration,
    executeVideo: executeOpenAiCompatibleVideoGeneration,
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
    completeLlm: (input) => runSiliconFlowLlmCompletion({
      modelId: input.selection.modelId,
      messages: input.messages,
      apiKey: input.providerConfig.apiKey,
      baseUrl: input.providerConfig.baseUrl,
      temperature: input.temperature,
    }),
    streamLlm: runSiliconFlowLlmStream,
    completeVision: runSiliconFlowVisionCompletion,
    executeImage: executeSiliconFlowImageGeneration,
    executeVideo: executeSiliconFlowVideoGeneration,
    executeAudio: executeSiliconFlowAudioGeneration,
  },
  {
    providerKey: 'vidu',
    executeVideo: executeViduVideoGeneration,
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
  providerConfig: ProviderConfig
}): 'official' | 'openai-compat' {
  const providerKey = getProviderKey(input.providerId).toLowerCase()
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
