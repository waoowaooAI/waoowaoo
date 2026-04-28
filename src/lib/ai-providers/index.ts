import OpenAI from 'openai'
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
} from '@/lib/ai-providers/shared/voice-line-binding'
import type { VideoTokenPricingContract } from '@/lib/ai-providers/shared/video-token-pricing'
export {
  getSpeakerVoicePreviewUrl,
  hasAnyVoiceBinding,
} from '@/lib/ai-providers/shared/voice-line-binding'
export type {
  CharacterVoiceFields,
  SpeakerVoiceEntry,
  SpeakerVoiceMap,
  SpeakerVoicePatch,
} from '@/lib/ai-providers/shared/voice-line-binding'

export type LlmConnectionTestProvider =
  | 'openrouter'
  | 'google'
  | 'anthropic'
  | 'openai'
  | 'bailian'
  | 'siliconflow'
  | 'openai-compatible'
  | 'gemini-compatible'
  | 'custom'

export interface LlmConnectionTestPayload {
  provider: LlmConnectionTestProvider
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface LlmConnectionTestResult {
  provider: LlmConnectionTestProvider
  message: string
  model?: string
  answer?: string
}

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

type LlmConnectionTestPartialResult = Pick<LlmConnectionTestResult, 'model' | 'answer'>

interface LlmConnectionTester {
  provider: LlmConnectionTestProvider
  test: (payload: LlmConnectionTestPayload) => Promise<LlmConnectionTestPartialResult>
}

async function testGoogleAI(apiKey: string): Promise<LlmConnectionTestPartialResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { method: 'GET' },
  )
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google AI 认证失败: ${error}`)
  }
  return {}
}

async function testOpenAICompatibleConnection(params: {
  apiKey: string
  baseURL?: string
  model?: string
  defaultHeaders?: { [name: string]: string }
}): Promise<LlmConnectionTestPartialResult> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    timeout: 30000,
    defaultHeaders: params.defaultHeaders,
  })

  if (params.model) {
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: 'user', content: '1+1等于几？只回答数字' }],
      max_tokens: 10,
      temperature: 0,
    })
    const answer = response.choices[0]?.message?.content?.trim() || ''
    return {
      model: response.model || params.model,
      answer,
    }
  }

  await client.models.list()
  return {}
}

async function testBailianLlmConnection(apiKey: string): Promise<LlmConnectionTestPartialResult> {
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Bailian probe failed (${response.status}): ${error}`)
  }
  const data = await response.json() as { data?: Array<{ id?: string }> }
  const firstModel = Array.isArray(data.data) ? data.data.find((item) => typeof item.id === 'string')?.id : undefined
  return { model: firstModel }
}

async function testSiliconFlowLlmConnection(apiKey: string): Promise<LlmConnectionTestPartialResult> {
  const modelsResponse = await fetch('https://api.siliconflow.cn/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!modelsResponse.ok) {
    const error = await modelsResponse.text()
    throw new Error(`SiliconFlow models probe failed (${modelsResponse.status}): ${error}`)
  }

  const modelData = await modelsResponse.json() as { data?: Array<{ id?: string }> }
  const firstModel = Array.isArray(modelData.data) ? modelData.data.find((item) => typeof item.id === 'string')?.id : undefined

  const userInfoResponse = await fetch('https://api.siliconflow.cn/v1/user/info', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!userInfoResponse.ok) {
    const error = await userInfoResponse.text()
    throw new Error(`SiliconFlow user info probe failed (${userInfoResponse.status}): ${error}`)
  }
  const info = await userInfoResponse.json() as { balance?: unknown; data?: { balance?: unknown } }
  const rawBalance = info.balance ?? info.data?.balance
  const balance = typeof rawBalance === 'number'
    ? String(rawBalance)
    : typeof rawBalance === 'string' && rawBalance.trim()
      ? rawBalance.trim()
      : undefined

  return {
    model: firstModel,
    answer: typeof balance === 'string' ? `balance=${balance}` : 'userinfo_ok',
  }
}

function requireLlmConnectionBaseUrl(payload: LlmConnectionTestPayload): string {
  const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : ''
  if (!baseUrl) {
    throw new Error('自定义渠道需要提供 baseUrl')
  }
  return baseUrl
}

const llmConnectionTesters: LlmConnectionTester[] = [
  {
    provider: 'openrouter',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'google',
    test: (payload) => testGoogleAI(payload.apiKey),
  },
  {
    provider: 'anthropic',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: 'https://api.anthropic.com/v1',
      model: payload.model || 'claude-3-haiku-20240307',
      defaultHeaders: { 'anthropic-version': '2023-06-01' },
    }),
  },
  {
    provider: 'openai',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'bailian',
    test: (payload) => testBailianLlmConnection(payload.apiKey),
  },
  {
    provider: 'siliconflow',
    test: (payload) => testSiliconFlowLlmConnection(payload.apiKey),
  },
  {
    provider: 'openai-compatible',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: requireLlmConnectionBaseUrl(payload),
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'gemini-compatible',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: requireLlmConnectionBaseUrl(payload),
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'custom',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: requireLlmConnectionBaseUrl(payload),
      model: payload.model || undefined,
    }),
  },
]

export function isRegisteredLlmConnectionTestProvider(provider: string): provider is LlmConnectionTestProvider {
  return llmConnectionTesters.some((tester) => tester.provider === provider)
}

export async function testRegisteredLlmConnection(payload: LlmConnectionTestPayload): Promise<LlmConnectionTestResult> {
  const tester = llmConnectionTesters.find((candidate) => candidate.provider === payload.provider)
  if (!tester) {
    throw new Error(`不支持的渠道: ${payload.provider}`)
  }
  const tested = await tester.test(payload)
  return {
    provider: payload.provider,
    message: `${payload.provider} 连接成功`,
    ...tested,
  }
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
