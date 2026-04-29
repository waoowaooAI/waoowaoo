import { fetchWithTimeoutAndRetry } from '@/lib/ai-providers/ark/image'
import { queryFalStatus } from '@/lib/ai-providers/fal/queue'

export async function queryFalGeneratedMediaStatus(input: {
  endpoint: string
  requestId: string
  apiKey: string
}) {
  return await queryFalStatus(input.endpoint, input.requestId, input.apiKey)
}

export async function fetchGeneratedMediaWithRetry(
  url: string,
  options?: RequestInit & { timeoutMs?: number; maxRetries?: number; logPrefix?: string },
): Promise<Response> {
  return await fetchWithTimeoutAndRetry(url, options)
}
