import type { AsyncTaskProviderRegistration, ParsedAsyncExternalId } from '@/lib/ai-providers/async-task-types'

function parseSiliconFlowExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
    throw new Error(`无效 SILICONFLOW externalId: "${externalId}"，应为 SILICONFLOW:TYPE:requestId`)
  }
  return {
    provider: 'SILICONFLOW',
    type,
    requestId,
  }
}

export const siliconFlowAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'SILICONFLOW',
  canParseExternalId: (externalId) => externalId.startsWith('SILICONFLOW:'),
  parseExternalId: parseSiliconFlowExternalId,
  formatExternalId: (input) => `SILICONFLOW:${input.type}:${input.requestId}`,
  poll: async ({ parsed }) => ({
    status: 'failed',
    error: `ASYNC_POLL_NOT_IMPLEMENTED: SILICONFLOW task polling not implemented (${parsed.requestId})`,
  }),
}

