import OpenAI from 'openai'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import {
  OPENAI_OFFICIAL_IMAGE_QUALITIES,
  OPENAI_OFFICIAL_IMAGE_SIZES,
  runOpenAIImageRequest,
  type OpenAIImageProtocolOptions,
} from '@/lib/ai-providers/shared/openai-image'

const OPENAI_IMAGE_OPTION_KEYS = new Set([
  'provider',
  'modelId',
  'modelKey',
  'size',
  'resolution',
  'quality',
  'outputFormat',
  'background',
  'outputCompression',
  'moderation',
])

function createOpenAIClient(input: {
  apiKey: string
  baseUrl?: string
}): OpenAI {
  return new OpenAI({
    apiKey: input.apiKey,
    ...(input.baseUrl ? { baseURL: input.baseUrl } : {}),
  })
}

function aspectRatioToOpenAISize(aspectRatio: string | undefined): string | undefined {
  if (!aspectRatio) return undefined
  const ratio = aspectRatio.trim()
  const mapping: Record<string, string> = {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
  }
  return mapping[ratio] || undefined
}

export async function executeOpenAiImageGeneration(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  const client = createOpenAIClient({
    apiKey: providerConfig.apiKey,
    ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
  })
  const modelId = requireSelectedModelId(input.selection, 'openai:image')
  const options = input.options ?? {}
  const referenceImages = options.referenceImages ?? []
  let requestOptions = { ...options }
  delete requestOptions.referenceImages
  if (requestOptions.aspectRatio && typeof requestOptions.aspectRatio === 'string') {
    const mappedSize = aspectRatioToOpenAISize(requestOptions.aspectRatio)
    if (mappedSize && !requestOptions.size) {
      requestOptions = { ...requestOptions, size: mappedSize }
    }
    delete requestOptions.aspectRatio
  }

  return await runOpenAIImageRequest({
    client,
    providerId: input.selection.provider,
    modelId,
    prompt: input.prompt,
    referenceImages,
    options: {
      ...requestOptions,
      provider: input.selection.provider,
      modelId,
      modelKey: input.selection.modelKey,
    } as OpenAIImageProtocolOptions,
    allowedKeys: OPENAI_IMAGE_OPTION_KEYS,
    allowedSizes: OPENAI_OFFICIAL_IMAGE_SIZES,
    allowedQualities: OPENAI_OFFICIAL_IMAGE_QUALITIES,
    supportsResponseFormat: false,
    errorPrefix: 'OPENAI',
  })
}
