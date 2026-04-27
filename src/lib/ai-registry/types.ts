import type OpenAI from 'openai'

export type AiModality = 'llm' | 'vision' | 'image' | 'video' | 'audio' | 'lipsync'
export type AiExecutionMode = 'sync' | 'async' | 'stream' | 'batch'
export type AiVariantSubKind = 'official' | 'user-template'

export type AiOptionValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export type AiOptionValidator = (value: unknown) => AiOptionValidationResult
export type AiOptionObjectValidator = (options: Readonly<Record<string, unknown>>) => AiOptionValidationResult

export type AiOptionSchema = {
  allowedKeys: ReadonlySet<string>
  required?: readonly string[]
  requiresOneOf?: ReadonlyArray<{ keys: readonly string[]; message: string }>
  conflicts?: ReadonlyArray<{ keys: readonly string[]; message: string; allowSameValue?: boolean }>
  validators: Readonly<Record<string, AiOptionValidator>>
  objectValidators?: readonly AiOptionObjectValidator[]
}

export type AiVariantDescriptor = {
  modelKey: string
  providerKey: string
  providerId: string
  modelId: string
  modality: AiModality

  familyRef?: string

  display: {
    name: string
    sourceLabel: string
    label: string
  }

  execution: {
    mode: AiExecutionMode
    externalIdPrefix?: string
  }

  capabilities: Record<string, unknown>
  optionSchema: AiOptionSchema
  inputContracts?: Record<string, unknown>
}

export type AiResolvedSelection = {
  provider: string
  modelId: string
  modelKey: string
  variantSubKind: AiVariantSubKind
  variantData?: Record<string, unknown>
}

export type AiResolvedLlmSelection = AiResolvedSelection & {
  llmProtocol?: 'responses' | 'chat-completions'
}

export type AiLlmMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AiLlmProviderConfig = {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
}

export type AiLlmExecutionInput = {
  userId: string
  providerKey: string
  selection: AiResolvedLlmSelection
  providerConfig: AiLlmProviderConfig
  messages: AiLlmMessage[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries: number
}

export type AiLlmUsage = {
  promptTokens: number
  completionTokens: number
}

export type AiLlmExecutionResult = {
  completion: OpenAI.Chat.Completions.ChatCompletion
  logProvider: string
  text: string
  reasoning: string
  usage?: AiLlmUsage | null
  successDetails?: Record<string, unknown>
}
