import OpenAI from 'openai'
import { getProviderConfig } from '@/lib/user-api/runtime-config'

export interface OpenAICompatClientConfig {
  providerId: string
  baseUrl: string
  apiKey: string
}

export async function resolveOpenAICompatClientConfig(
  userId: string,
  providerId: string,
): Promise<OpenAICompatClientConfig> {
  const config = await getProviderConfig(userId, providerId)
  if (!config.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
  }
  return {
    providerId: config.id,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  }
}

export function createOpenAICompatClient(config: OpenAICompatClientConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })
}
