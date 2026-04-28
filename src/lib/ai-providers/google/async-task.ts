import type { AsyncTaskProviderRegistration, ParsedAsyncExternalId } from '@/lib/ai-providers/async-task-types'
import { queryGeminiBatchStatus, queryGoogleVideoStatus } from './poll'

function parseGeminiExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if (type !== 'BATCH' || !requestId) {
    throw new Error(`无效 GEMINI externalId: "${externalId}"，应为 GEMINI:BATCH:batchName`)
  }
  return {
    provider: 'GEMINI',
    type: 'BATCH',
    requestId,
  }
}

function parseGoogleExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if (type !== 'VIDEO' || !requestId) {
    throw new Error(`无效 GOOGLE externalId: "${externalId}"，应为 GOOGLE:VIDEO:operationName`)
  }
  return {
    provider: 'GOOGLE',
    type: 'VIDEO',
    requestId,
  }
}

export const geminiBatchAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'GEMINI',
  canParseExternalId: (externalId) => externalId.startsWith('GEMINI:'),
  parseExternalId: parseGeminiExternalId,
  formatExternalId: (input) => `GEMINI:${input.type}:${input.requestId}`,
  poll: async ({ parsed, context }) => {
    const { apiKey } = await context.getProviderConfig(context.userId, 'google')
    const result = await queryGeminiBatchStatus(parsed.requestId, apiKey)
    return {
      status: result.status,
      imageUrl: result.imageUrl,
      resultUrl: result.imageUrl,
      error: result.error,
    }
  },
}

export const googleVideoAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'GOOGLE',
  canParseExternalId: (externalId) => externalId.startsWith('GOOGLE:'),
  parseExternalId: parseGoogleExternalId,
  formatExternalId: (input) => `GOOGLE:${input.type}:${input.requestId}`,
  poll: async ({ parsed, context }) => {
    const { apiKey } = await context.getProviderConfig(context.userId, 'google')
    const result = await queryGoogleVideoStatus(parsed.requestId, apiKey)
    return {
      status: result.status,
      videoUrl: result.videoUrl,
      resultUrl: result.videoUrl,
      error: result.error,
    }
  },
}

