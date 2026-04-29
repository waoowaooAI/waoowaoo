import { logInfo as _ulogInfo } from '@/lib/logging/core'
import type { AsyncTaskProviderRegistration, ParsedAsyncExternalId } from '@/lib/ai-providers/async-task-types'
import { queryViduTaskStatus } from './poll'

function parseViduExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
    throw new Error(`无效 VIDU externalId: "${externalId}"，应为 VIDU:TYPE:taskId`)
  }
  return {
    provider: 'VIDU',
    type,
    requestId,
  }
}

export const viduAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'VIDU',
  canParseExternalId: (externalId) => externalId.startsWith('VIDU:'),
  parseExternalId: parseViduExternalId,
  formatExternalId: (input) => `VIDU:${input.type}:${input.requestId}`,
  poll: async ({ parsed, context }) => {
    _ulogInfo(`[Poll Vidu] 开始轮询 task_id=${parsed.requestId}, userId=${context.userId}`)
    const { apiKey } = await context.getProviderConfig(context.userId, 'vidu')
    _ulogInfo(`[Poll Vidu] API Key 长度: ${apiKey?.length || 0}`)
    const result = await queryViduTaskStatus(parsed.requestId, apiKey)
    _ulogInfo('[Poll Vidu] 查询结果:', result)
    return {
      status: result.status,
      videoUrl: result.videoUrl,
      resultUrl: result.videoUrl,
      error: result.error,
    }
  },
}

