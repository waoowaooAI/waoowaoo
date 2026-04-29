import { GoogleGenAI } from '@google/genai'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import type { AiProviderVideoExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'

type GoogleVeoOptions = NonNullable<AiProviderVideoExecutionContext['options']>

type GoogleVeoInlineData = { mimeType: string; imageBytes: string }

type GoogleVeoConfig = {
  aspectRatio?: string
  resolution?: string
  durationSeconds?: number
  lastFrame?: GoogleVeoInlineData
}

type GoogleVeoRequest = {
  model: string
  prompt?: string
  image?: GoogleVeoInlineData
  config?: GoogleVeoConfig
}

type UnknownObject = { [key: string]: unknown }

function isUnknownObject(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function dataUrlToInlineData(dataUrl: string): GoogleVeoInlineData | null {
  const base64Start = dataUrl.indexOf(';base64,')
  if (base64Start === -1) return null
  const mimeType = dataUrl.substring(5, base64Start)
  const imageBytes = dataUrl.substring(base64Start + 8)
  return { mimeType, imageBytes }
}

function extractOperationName(response: unknown): string | null {
  if (!isUnknownObject(response)) return null
  if (typeof response.name === 'string') return response.name
  if (isUnknownObject(response.operation) && typeof response.operation.name === 'string') return response.operation.name
  if (typeof response.operationName === 'string') return response.operationName
  if (typeof response.id === 'string') return response.id
  return null
}

function assertAllowedGoogleVideoOptions(options: GoogleVeoOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelKey',
    'aspectRatio',
    'resolution',
    'duration',
    'lastFrameImageUrl',
    'prompt',
    'fps',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`GOOGLE_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

export async function executeGoogleVideoGeneration(input: AiProviderVideoExecutionContext): Promise<GenerateResult> {
  const options: GoogleVeoOptions = input.options ?? {}
  assertAllowedGoogleVideoOptions(options)

  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  const ai = new GoogleGenAI({ apiKey })

  const modelId = requireSelectedModelId(input.selection, 'google:video')
  const aspectRatio = options.aspectRatio
  const resolution = options.resolution
  const duration = options.duration
  const lastFrameImageUrl = options.lastFrameImageUrl
  const prompt = typeof options.prompt === 'string' ? options.prompt : ''

  const request: GoogleVeoRequest = { model: modelId }
  if (prompt.trim().length > 0) request.prompt = prompt

  const config: GoogleVeoConfig = {}
  if (aspectRatio) config.aspectRatio = aspectRatio
  if (resolution) config.resolution = resolution
  if (typeof duration === 'number') config.durationSeconds = duration

  let hasImageInput = false
  if (input.imageUrl) {
    const dataUrl = input.imageUrl.startsWith('data:') ? input.imageUrl : await normalizeToBase64ForGeneration(input.imageUrl)
    const inlineData = dataUrlToInlineData(dataUrl)
    if (inlineData) {
      request.image = inlineData
      hasImageInput = true
    }
  }

  if (lastFrameImageUrl) {
    if (!hasImageInput) {
      throw new Error('Veo lastFrame requires image input')
    }
    const dataUrl = lastFrameImageUrl.startsWith('data:')
      ? lastFrameImageUrl
      : await normalizeToBase64ForGeneration(lastFrameImageUrl)
    const inlineData = dataUrlToInlineData(dataUrl)
    if (!inlineData) {
      throw new Error('Veo lastFrame image is invalid')
    }
    config.lastFrame = inlineData
  }

  if (Object.keys(config).length > 0) {
    request.config = config
  }

  const response = await ai.models.generateVideos(request as unknown as Parameters<typeof ai.models.generateVideos>[0])
  const operationName = extractOperationName(response)
  if (!operationName) {
    throw new Error('Veo 未返回 operation name')
  }

  return {
    success: true,
    async: true,
    requestId: operationName,
    externalId: `GOOGLE:VIDEO:${operationName}`,
  }
}
