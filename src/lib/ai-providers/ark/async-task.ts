import type { AsyncTaskProviderRegistration, ParsedAsyncExternalId } from '@/lib/ai-providers/async-task-types'
import { querySeedanceVideoStatus } from './poll'

function parseArkExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
    throw new Error(`无效 ARK externalId: "${externalId}"，应为 ARK:TYPE:requestId`)
  }
  return {
    provider: 'ARK',
    type,
    requestId,
  }
}

export const arkAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'ARK',
  canParseExternalId: (externalId) => externalId.startsWith('ARK:'),
  parseExternalId: parseArkExternalId,
  formatExternalId: (input) => `ARK:${input.type}:${input.requestId}`,
  poll: async ({ parsed, context }) => {
    const { apiKey } = await context.getProviderConfig(context.userId, 'ark')
    const result = await querySeedanceVideoStatus(parsed.requestId, apiKey)
    return {
      status: result.status,
      videoUrl: result.videoUrl,
      resultUrl: result.videoUrl,
      ...(typeof result.actualVideoTokens === 'number' ? { actualVideoTokens: result.actualVideoTokens } : {}),
      error: result.error,
    }
  },
}

