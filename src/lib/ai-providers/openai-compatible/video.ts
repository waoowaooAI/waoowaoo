import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { toFile } from 'openai'
import type { AiProviderVideoExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { createOpenAICompatClient, parseDataUrl, resolveOpenAICompatClientConfig } from '@/lib/ai-providers/openai-compatible/errors'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-registry/openai-compatible-template'
import { generateVideoViaOpenAICompatTemplate } from '@/lib/ai-providers/openai-compatible/user-template'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'

type OpenAICompatVideoOptions = NonNullable<AiProviderVideoExecutionContext['options']>

type OpenAIVideoSize = '720x1280' | '1280x720' | '1024x1792' | '1792x1024'
type OpenAIVideoSeconds = '4' | '8' | '12'
type OpenAIVideoAspectRatio =
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '3:2'
  | '2:3'
  | '21:9'
  | '9:21'
  | '1:1'
  | 'auto'

const OPENAI_COMPAT_VIDEO_OPTION_KEYS = new Set([
  'provider',
  'modelId',
  'modelKey',
  'duration',
  'resolution',
  'aspectRatio',
  'aspect_ratio',
  'size',
  'generateAudio',
  'generationMode',
  'prompt',
  'fps',
  'lastFrameImageUrl',
])

function assertAllowedOptions(options: OpenAICompatVideoOptions) {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!OPENAI_COMPAT_VIDEO_OPTION_KEYS.has(key)) {
      throw new Error(`OPENAI_COMPAT_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function normalizeDuration(value: unknown): OpenAIVideoSeconds | undefined {
  if (value === 4 || value === '4') return '4'
  if (value === 8 || value === '8') return '8'
  if (value === 12 || value === '12') return '12'
  if (value === undefined) return undefined
  throw new Error(`OPENAI_COMPAT_VIDEO_DURATION_UNSUPPORTED: ${String(value)}`)
}

function normalizeAspectRatio(value: unknown): OpenAIVideoAspectRatio | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`OPENAI_COMPAT_VIDEO_ASPECT_RATIO_UNSUPPORTED: ${String(value)}`)
  }
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    trimmed === '16:9'
    || trimmed === '9:16'
    || trimmed === '4:3'
    || trimmed === '3:4'
    || trimmed === '3:2'
    || trimmed === '2:3'
    || trimmed === '21:9'
    || trimmed === '9:21'
    || trimmed === '1:1'
    || trimmed === 'auto'
  ) {
    return trimmed
  }
  throw new Error(`OPENAI_COMPAT_VIDEO_ASPECT_RATIO_UNSUPPORTED: ${trimmed}`)
}

function resolveAspectRatio(options: OpenAICompatVideoOptions): OpenAIVideoAspectRatio | undefined {
  const aspectRatio = normalizeAspectRatio(options.aspectRatio)
  const aspectRatioAlt = normalizeAspectRatio((options as { aspect_ratio?: unknown }).aspect_ratio)
  if (aspectRatio && aspectRatioAlt && aspectRatio !== aspectRatioAlt) {
    throw new Error('OPENAI_COMPAT_VIDEO_ASPECT_RATIO_CONFLICT: aspectRatio and aspect_ratio must match')
  }
  return aspectRatio || aspectRatioAlt
}

function normalizeModel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'sora-2'
  if (typeof value !== 'string') {
    throw new Error(`OPENAI_COMPAT_VIDEO_MODEL_INVALID: ${String(value)}`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('OPENAI_COMPAT_VIDEO_MODEL_INVALID: empty model id')
  }
  return trimmed
}

function resolveSizeOrientation(aspectRatio: OpenAIVideoAspectRatio | undefined): 'portrait' | 'landscape' {
  if (
    aspectRatio === '9:16'
    || aspectRatio === '3:4'
    || aspectRatio === '2:3'
    || aspectRatio === '9:21'
  ) {
    return 'portrait'
  }
  return 'landscape'
}

function normalizeSize(value: unknown, aspectRatio: OpenAIVideoAspectRatio | undefined): OpenAIVideoSize | undefined {
  if (value === '720x1280' || value === '1280x720' || value === '1024x1792' || value === '1792x1024') {
    return value
  }

  const orientation = resolveSizeOrientation(aspectRatio)
  if (value === '720p') {
    return orientation === 'portrait' ? '720x1280' : '1280x720'
  }
  if (value === '1080p') {
    return orientation === 'portrait' ? '1024x1792' : '1792x1024'
  }
  if (value === undefined) return undefined
  throw new Error(`OPENAI_COMPAT_VIDEO_SIZE_UNSUPPORTED: ${String(value)}`)
}

function resolveFinalSize(options: OpenAICompatVideoOptions): OpenAIVideoSize | undefined {
  const aspectRatio = resolveAspectRatio(options)
  const normalizedSize = options.size === undefined ? undefined : normalizeSize(options.size, aspectRatio)
  const normalizedResolution = options.resolution === undefined ? undefined : normalizeSize(options.resolution, aspectRatio)
  if (normalizedSize && normalizedResolution && normalizedSize !== normalizedResolution) {
    throw new Error('OPENAI_COMPAT_VIDEO_SIZE_CONFLICT: size and resolution must match')
  }
  return normalizedSize || normalizedResolution
}

function encodeProviderId(providerId: string): string {
  return Buffer.from(providerId, 'utf8').toString('base64url')
}

async function toUploadFileFromImageUrl(imageUrl: string): Promise<File> {
  const base64DataUrl = imageUrl.startsWith('data:') ? imageUrl : await normalizeToBase64ForGeneration(imageUrl)
  const parsed = parseDataUrl(base64DataUrl)
  if (!parsed) {
    throw new Error('OPENAI_COMPAT_VIDEO_INPUT_REFERENCE_INVALID')
  }
  const bytes = Buffer.from(parsed.base64, 'base64')
  return await toFile(bytes, 'input-reference.png', { type: parsed.mimeType })
}

async function generateVideoViaOpenAICompat(request: {
  userId: string
  providerId: string
  modelId: string | undefined
  modelKey: string
  imageUrl: string
  prompt: string
  options: OpenAICompatVideoOptions
}): Promise<GenerateResult> {
  assertAllowedOptions(request.options)
  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const client = createOpenAICompatClient(config)

  const selectedModelId = normalizeModel(request.modelId)
  const seconds = normalizeDuration(request.options.duration)
  const size = resolveFinalSize(request.options)
  const trimmedPrompt = request.prompt.trim()
  if (!trimmedPrompt) {
    throw new Error('OPENAI_COMPAT_VIDEO_PROMPT_REQUIRED')
  }

  const inputReference = await toUploadFileFromImageUrl(request.imageUrl)
  const response = await client.videos.create({
    prompt: trimmedPrompt,
    model: selectedModelId,
    ...(seconds ? { seconds } : {}),
    ...(size ? { size } : {}),
    input_reference: inputReference,
  } as Parameters<typeof client.videos.create>[0])

  if (!response.id || typeof response.id !== 'string') {
    throw new Error('OPENAI_COMPAT_VIDEO_CREATE_INVALID_RESPONSE: missing video id')
  }

  const providerToken = encodeProviderId(config.providerId)
  return {
    success: true,
    async: true,
    requestId: response.id,
    externalId: `OPENAI:VIDEO:${providerToken}:${response.id}`,
  }
}

export async function executeOpenAiCompatibleVideoGeneration(input: AiProviderVideoExecutionContext) {
  const { prompt, ...providerOptions } = input.options || {}
  const modelId = requireSelectedModelId(input.selection, 'openai-compatible:video')
  const compatTemplate = input.selection.variantData?.compatMediaTemplate as OpenAICompatMediaTemplate | undefined
  if (compatTemplate) {
    return await generateVideoViaOpenAICompatTemplate({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId,
      modelKey: input.selection.modelKey,
      imageUrl: input.imageUrl,
      prompt: prompt || '',
      options: {
        ...providerOptions,
        provider: input.selection.provider,
        modelId,
        modelKey: input.selection.modelKey,
      },
      profile: 'openai-compatible',
      template: compatTemplate,
    })
  }

  return await generateVideoViaOpenAICompat({
    userId: input.userId,
    providerId: input.selection.provider,
    modelId,
    modelKey: input.selection.modelKey,
    imageUrl: input.imageUrl,
    prompt: prompt || '',
    options: {
      ...providerOptions,
      provider: input.selection.provider,
      modelId,
      modelKey: input.selection.modelKey,
    } as OpenAICompatVideoOptions,
  })
}
