import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { createOpenAICompatClient, resolveOpenAICompatClientConfig } from '@/lib/ai-providers/openai-compatible/errors'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-registry/openai-compatible-template'
import { generateImageViaOpenAICompatTemplate } from '@/lib/ai-providers/openai-compatible/user-template'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import {
  OPENAI_IMAGE_QUALITIES,
  OPENAI_IMAGE_SIZES,
  runOpenAIImageRequest,
  type OpenAIImageProtocolOptions,
} from '@/lib/ai-providers/shared/openai-image'

type OpenAICompatImageOptions = NonNullable<AiProviderImageExecutionContext['options']>

const OPENAI_COMPAT_IMAGE_OPTION_KEYS = new Set([
  'provider',
  'modelId',
  'modelKey',
  'size',
  'resolution',
  'quality',
  'responseFormat',
  'outputFormat',
])

function resolveModelId(modelId: string | undefined): string {
  const selected = typeof modelId === 'string' ? modelId.trim() : ''
  if (selected) return selected
  throw new Error('OPENAI_COMPAT_IMAGE_MODEL_ID_REQUIRED')
}

async function generateImageViaOpenAICompat(input: {
  userId: string
  providerId: string
  modelId: string | undefined
  prompt: string
  referenceImages: string[]
  options: OpenAICompatImageOptions
}): Promise<GenerateResult> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const client = createOpenAICompatClient(config)
  const normalizedModelId = resolveModelId(input.modelId)

  return await runOpenAIImageRequest({
    client,
    providerId: input.providerId,
    modelId: normalizedModelId,
    prompt: input.prompt,
    referenceImages: input.referenceImages,
    options: input.options as OpenAIImageProtocolOptions,
    allowedKeys: OPENAI_COMPAT_IMAGE_OPTION_KEYS,
    allowedSizes: OPENAI_IMAGE_SIZES,
    allowedQualities: OPENAI_IMAGE_QUALITIES,
    supportsResponseFormat: true,
    errorPrefix: 'OPENAI_COMPAT',
  })
}

function aspectRatioToOpenAISize(aspectRatio: string | undefined): string | undefined {
  if (!aspectRatio) return undefined
  const ratio = aspectRatio.trim()
  const mapping: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
  }
  return mapping[ratio] || undefined
}

export async function executeOpenAiCompatibleImageGeneration(input: AiProviderImageExecutionContext) {
  const options = input.options ?? {}
  const referenceImages = options.referenceImages ?? []
  const generatorOptions: OpenAICompatImageOptions = { ...options }
  delete generatorOptions.referenceImages
  const modelId = requireSelectedModelId(input.selection, 'openai-compatible:image')
  const compatTemplate = input.selection.variantData?.compatMediaTemplate as OpenAICompatMediaTemplate | undefined
  if (compatTemplate) {
    return await generateImageViaOpenAICompatTemplate({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId,
      modelKey: input.selection.modelKey,
      prompt: input.prompt,
      referenceImages,
      options: {
        ...generatorOptions,
        provider: input.selection.provider,
        modelId,
        modelKey: input.selection.modelKey,
      },
      profile: 'openai-compatible',
      template: compatTemplate,
    })
  }

  let openaiCompatOptions = { ...generatorOptions }
  if (openaiCompatOptions.aspectRatio && typeof openaiCompatOptions.aspectRatio === 'string') {
    const mappedSize = aspectRatioToOpenAISize(openaiCompatOptions.aspectRatio)
    if (mappedSize && !openaiCompatOptions.size) {
      openaiCompatOptions = { ...openaiCompatOptions, size: mappedSize }
    }
    delete openaiCompatOptions.aspectRatio
  }

  return await generateImageViaOpenAICompat({
    userId: input.userId,
    providerId: input.selection.provider,
    modelId,
    prompt: input.prompt,
    referenceImages,
    options: {
      ...openaiCompatOptions,
      provider: input.selection.provider,
      modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
