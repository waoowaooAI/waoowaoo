import { logError as _ulogError } from '@/lib/logging/core'
import type { AsyncTaskProviderRegistration, ParsedAsyncExternalId } from '@/lib/ai-providers/async-task-types'
import { queryBailianTaskStatus } from './poll'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string') return candidate
  }
  return '查询异常'
}

function parseBailianExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const requestId = parts.slice(2).join(':')
  if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
    throw new Error(`无效 BAILIAN externalId: "${externalId}"，应为 BAILIAN:TYPE:requestId`)
  }
  return {
    provider: 'BAILIAN',
    type,
    requestId,
  }
}

export const bailianAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'BAILIAN',
  canParseExternalId: (externalId) => externalId.startsWith('BAILIAN:'),
  parseExternalId: parseBailianExternalId,
  formatExternalId: (input) => `BAILIAN:${input.type}:${input.requestId}`,
  poll: async ({ parsed, context }) => {
    const logPrefix = '[Bailian Query]'
    try {
      const { apiKey } = await context.getProviderConfig(context.userId, 'bailian')
      const result = await queryBailianTaskStatus(parsed.requestId, apiKey)
      return {
        status: result.status,
        resultUrl: result.videoUrl || result.imageUrl,
        videoUrl: result.videoUrl,
        imageUrl: result.imageUrl,
        error: result.error,
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      _ulogError(`${logPrefix} task_id=${parsed.requestId} 异常:`, error)
      return {
        status: 'failed',
        error: `Bailian: ${errorMessage}`,
      }
    }
  },
}

