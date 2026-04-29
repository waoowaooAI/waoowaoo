import type { AiLlmProviderConfig } from '@/lib/ai-registry/types'

export type AsyncExternalIdProvider =
  | 'FAL'
  | 'ARK'
  | 'GEMINI'
  | 'GOOGLE'
  | 'MINIMAX'
  | 'VIDU'
  | 'OPENAI'
  | 'OCOMPAT'
  | 'BAILIAN'
  | 'SILICONFLOW'

export type AsyncExternalIdType = 'VIDEO' | 'IMAGE' | 'BATCH'

export interface AsyncDownloadHeaders {
  [name: string]: string
}

export interface AsyncPollResult {
  status: 'pending' | 'completed' | 'failed'
  resultUrl?: string
  imageUrl?: string
  videoUrl?: string
  actualVideoTokens?: number
  downloadHeaders?: AsyncDownloadHeaders
  error?: string
}

export interface ParsedAsyncExternalId {
  provider: AsyncExternalIdProvider
  type: AsyncExternalIdType
  endpoint?: string
  requestId: string
  providerToken?: string
  modelKeyToken?: string
}

export interface FormatAsyncExternalIdInput {
  type: AsyncExternalIdType
  requestId: string
  endpoint?: string
  providerToken?: string
  modelKeyToken?: string
}

export interface AsyncUserModelForPolling {
  modelKey: string
  modelId: string
  compatMediaTemplate?: unknown
}

export interface AsyncTaskPollContext {
  userId: string
  getProviderConfig: (userId: string, providerId: string) => Promise<AiLlmProviderConfig>
  getUserModels: (userId: string) => Promise<AsyncUserModelForPolling[]>
}

export interface AsyncTaskPollInput {
  parsed: ParsedAsyncExternalId
  context: AsyncTaskPollContext
}

export interface AsyncTaskProviderRegistration {
  providerCode: AsyncExternalIdProvider
  canParseExternalId: (externalId: string) => boolean
  parseExternalId: (externalId: string) => ParsedAsyncExternalId
  formatExternalId: (input: FormatAsyncExternalIdInput) => string
  poll: (input: AsyncTaskPollInput) => Promise<AsyncPollResult>
}

