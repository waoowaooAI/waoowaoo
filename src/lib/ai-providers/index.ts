import { AiRegistry } from '@/lib/ai-registry/registry'
import { resolveAiGatewayRoute } from '@/lib/ai-registry/gateway-route'
import type { AiLlmProviderConfig } from '@/lib/ai-registry/types'
import type {
  AsyncExternalIdProvider,
  AsyncTaskProviderRegistration,
} from '@/lib/ai-providers/async-task-types'
import { anthropicAdapter } from '@/lib/ai-providers/anthropic/adapter'
import { arkAdapter } from '@/lib/ai-providers/ark/adapter'
import { arkAsyncTaskProvider } from '@/lib/ai-providers/ark/async-task'
import { arkSeedance2VideoTokenPricingContract } from '@/lib/ai-providers/ark/video-token-pricing'
import { bailianAdapter } from '@/lib/ai-providers/bailian/adapter'
import { bailianAsyncTaskProvider } from '@/lib/ai-providers/bailian/async-task'
import { normalizeBailianSpeakerVoiceEntry } from '@/lib/ai-providers/bailian/voice-line'
import { falAdapter } from '@/lib/ai-providers/fal/adapter'
import { falAsyncTaskProvider } from '@/lib/ai-providers/fal/async-task'
import { normalizeFalSpeakerVoiceEntry } from '@/lib/ai-providers/fal/voice-line'
import { geminiCompatibleAdapter, googleAdapter } from '@/lib/ai-providers/google/adapter'
import { geminiBatchAsyncTaskProvider, googleVideoAsyncTaskProvider } from '@/lib/ai-providers/google/async-task'
import { minimaxAdapter } from '@/lib/ai-providers/minimax/adapter'
import { minimaxAsyncTaskProvider } from '@/lib/ai-providers/minimax/async-task'
import { openAiCompatibleAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import {
  openAiCompatibleTemplateAsyncTaskProvider,
  openAiVideoAsyncTaskProvider,
} from '@/lib/ai-providers/openai-compatible/async-task'
import { openAiAdapter } from '@/lib/ai-providers/openai/adapter'
import { openRouterAdapter } from '@/lib/ai-providers/openrouter/adapter'
import { siliconFlowAdapter } from '@/lib/ai-providers/siliconflow/adapter'
import { siliconFlowAsyncTaskProvider } from '@/lib/ai-providers/siliconflow/async-task'
import { viduAdapter } from '@/lib/ai-providers/vidu/adapter'
import { viduAsyncTaskProvider } from '@/lib/ai-providers/vidu/async-task'
import type { AiProviderAdapter, AiProviderLanguageModelContext } from '@/lib/ai-providers/runtime-types'
import {
  readRawSpeakerVoiceEntry,
  type CharacterVoiceFields,
  type SpeakerVoiceEntry,
  type SpeakerVoiceEntryNormalizer,
  type SpeakerVoiceMap,
} from '@/lib/ai-registry/voice-line'
import type { VideoTokenPricingContract } from '@/lib/ai-providers/shared/video-token-pricing'
export {
  getSpeakerVoicePreviewUrl,
  hasAnyVoiceBinding,
} from '@/lib/ai-registry/voice-line'
export type {
  CharacterVoiceFields,
  SpeakerVoiceEntry,
  SpeakerVoiceMap,
  SpeakerVoicePatch,
} from '@/lib/ai-registry/voice-line'

function getProviderKey(providerId: string): string {
  const marker = providerId.indexOf(':')
  return (marker === -1 ? providerId : providerId.slice(0, marker)).toLowerCase()
}

const runtimeProviderRegistry = new AiRegistry<AiProviderAdapter>([
  anthropicAdapter,
  arkAdapter,
  bailianAdapter,
  falAdapter,
  googleAdapter,
  geminiCompatibleAdapter,
  minimaxAdapter,
  openAiCompatibleAdapter,
  openAiAdapter,
  openRouterAdapter,
  siliconFlowAdapter,
  viduAdapter,
])

const asyncTaskProviderRegistry: AsyncTaskProviderRegistration[] = [
  falAsyncTaskProvider,
  arkAsyncTaskProvider,
  geminiBatchAsyncTaskProvider,
  googleVideoAsyncTaskProvider,
  minimaxAsyncTaskProvider,
  viduAsyncTaskProvider,
  openAiVideoAsyncTaskProvider,
  openAiCompatibleTemplateAsyncTaskProvider,
  bailianAsyncTaskProvider,
  siliconFlowAsyncTaskProvider,
]

const videoTokenPricingContracts: VideoTokenPricingContract[] = [
  arkSeedance2VideoTokenPricingContract,
]

const speakerVoiceEntryNormalizers: SpeakerVoiceEntryNormalizer[] = [
  normalizeBailianSpeakerVoiceEntry,
  normalizeFalSpeakerVoiceEntry,
]

function normalizeSpeakerVoiceEntry(raw: unknown, speaker: string): SpeakerVoiceEntry {
  const entry = readRawSpeakerVoiceEntry(raw, speaker)
  for (const normalize of speakerVoiceEntryNormalizers) {
    const normalized = normalize(entry, speaker)
    if (normalized) return normalized
  }

  if (entry.provider) {
    throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_PROVIDER: ${speaker}`)
  }
  throw new Error(`SPEAKER_VOICE_ENTRY_MISSING_BINDING: ${speaker}`)
}

export function parseSpeakerVoiceMap(raw: string | null | undefined): SpeakerVoiceMap {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('SPEAKER_VOICES_INVALID_JSON')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SPEAKER_VOICES_INVALID_SHAPE')
  }

  const result: SpeakerVoiceMap = {}
  for (const [speaker, value] of Object.entries(parsed as { [speaker: string]: unknown })) {
    if (!speaker.trim()) {
      throw new Error('SPEAKER_VOICES_INVALID_SPEAKER')
    }
    result[speaker] = normalizeSpeakerVoiceEntry(value, speaker)
  }
  return result
}

export function resolveAsyncTaskProviderByExternalId(externalId: string): AsyncTaskProviderRegistration {
  const registration = asyncTaskProviderRegistry.find((candidate) => candidate.canParseExternalId(externalId))
  if (!registration) {
    throw new Error(
      `无法识别的 externalId 格式: "${externalId}". ` +
      `支持的格式: FAL:TYPE:endpoint:requestId, ARK:TYPE:requestId, GEMINI:BATCH:batchName, GOOGLE:VIDEO:operationName, MINIMAX:TYPE:taskId, VIDU:TYPE:taskId, OPENAI:VIDEO:providerToken:videoId, OCOMPAT:TYPE:providerToken:modelKeyToken:taskId, BAILIAN:TYPE:requestId, SILICONFLOW:TYPE:requestId`,
    )
  }
  return registration
}

export function resolveAsyncTaskProviderByCode(providerCode: AsyncExternalIdProvider): AsyncTaskProviderRegistration {
  const registration = asyncTaskProviderRegistry.find((candidate) => candidate.providerCode === providerCode)
  if (!registration) {
    throw new Error(`未知的 Provider: ${providerCode}`)
  }
  return registration
}

export function resolveVideoTokenPricingContract(model: string): VideoTokenPricingContract | null {
  return videoTokenPricingContracts.find((contract) => contract.supportsModel(model)) ?? null
}

export function resolveAiProviderAdapter(providerId: string): AiProviderAdapter {
  return runtimeProviderRegistry.getAdapterByProviderId(providerId)
}

export function createRegisteredLanguageModel(input: AiProviderLanguageModelContext) {
  const languageModelProvider = resolveAiProviderAdapter(input.selection.provider).languageModel
  if (!languageModelProvider) {
    throw new Error(`AI_PROVIDER_MODALITY_UNSUPPORTED:${input.selection.provider}:languageModel`)
  }
  return languageModelProvider.create(input)
}

export function resolveRegisteredVoiceLineBinding(params: {
  providerId: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}) {
  const voiceLineProvider = resolveAiProviderAdapter(params.providerId).voiceLine
  if (!voiceLineProvider) return null
  return voiceLineProvider.resolveBinding({
    character: params.character,
    speakerVoice: params.speakerVoice,
  })
}

export function hasRegisteredVoiceLineBinding(params: {
  providerId: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  return !!resolveRegisteredVoiceLineBinding(params)
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
