import type { AsyncTaskProviderRegistration, ParsedAsyncExternalId } from '@/lib/ai-providers/async-task-types'
import { queryMinimaxTaskStatus } from './poll'

function parseMinimaxExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
    throw new Error(`无效 MINIMAX externalId: "${externalId}"，应为 MINIMAX:TYPE:taskId`)
  }
  return {
    provider: 'MINIMAX',
    type,
    requestId,
  }
}

export const minimaxAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'MINIMAX',
  canParseExternalId: (externalId) => externalId.startsWith('MINIMAX:'),
  parseExternalId: parseMinimaxExternalId,
  formatExternalId: (input) => `MINIMAX:${input.type}:${input.requestId}`,
  poll: async ({ parsed, context }) => {
    const { apiKey } = await context.getProviderConfig(context.userId, 'minimax')
    const result = await queryMinimaxTaskStatus(parsed.requestId, apiKey)
    return {
      status: result.status,
      videoUrl: result.videoUrl,
      imageUrl: result.imageUrl,
      resultUrl: result.videoUrl || result.imageUrl,
      error: result.error,
    }
  },
}

