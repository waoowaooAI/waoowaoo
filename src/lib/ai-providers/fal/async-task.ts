import type {
  AsyncTaskProviderRegistration,
  FormatAsyncExternalIdInput,
  ParsedAsyncExternalId,
} from '@/lib/ai-providers/async-task-types'
import { queryFalStatus } from './queue'

function parseFalExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  if (type === 'VIDEO' || type === 'IMAGE') {
    if (parts.length < 4) {
      throw new Error(`无效 FAL externalId: "${externalId}"，应为 FAL:TYPE:endpoint:requestId`)
    }
    const endpoint = parts.slice(2, -1).join(':')
    const requestId = parts[parts.length - 1]
    if (!endpoint || !requestId) {
      throw new Error(`无效 FAL externalId: "${externalId}"，缺少 endpoint 或 requestId`)
    }
    return {
      provider: 'FAL',
      type,
      endpoint,
      requestId,
    }
  }
  throw new Error(`无效 FAL externalId: "${externalId}"，TYPE 仅支持 VIDEO/IMAGE`)
}

function formatFalExternalId(input: FormatAsyncExternalIdInput): string {
  if (!input.endpoint) {
    throw new Error('FAL externalId requires endpoint')
  }
  return `FAL:${input.type}:${input.endpoint}:${input.requestId}`
}

export const falAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'FAL',
  canParseExternalId: (externalId) => externalId.startsWith('FAL:'),
  parseExternalId: parseFalExternalId,
  formatExternalId: formatFalExternalId,
  poll: async ({ parsed, context }) => {
    if (!parsed.endpoint) throw new Error('FAL_ENDPOINT_MISSING')
    const { apiKey } = await context.getProviderConfig(context.userId, 'fal')
    const result = await queryFalStatus(parsed.endpoint, parsed.requestId, apiKey)
    return {
      status: result.completed ? (result.failed ? 'failed' : 'completed') : 'pending',
      resultUrl: result.resultUrl,
      imageUrl: result.resultUrl,
      videoUrl: result.resultUrl,
      error: result.error,
    }
  },
}

