import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { toFetchableUrl } from '@/lib/storage/utils'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianVideoGenerateParams {
  userId: string
  imageUrl: string
  prompt?: string
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'video' satisfies OfficialModelModality,
    modelId,
  })
}

const BAILIAN_VIDEO_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
const BAILIAN_KF2V_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis'
const BAILIAN_KF2V_MODELS = new Set([
  'wan2.2-kf2v-flash',
  'wanx2.1-kf2v-plus',
])

interface BailianVideoSubmitResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
  }
}

interface BailianVideoSubmitParameters {
  resolution?: string
  size?: string
  watermark?: boolean
  prompt_extend?: boolean
  duration?: number
}

interface BailianVideoSubmitBody {
  model: string
  input: Record<string, string>
  parameters?: BailianVideoSubmitParameters
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`BAILIAN_VIDEO_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function isKf2vModel(modelId: string): boolean {
  return BAILIAN_KF2V_MODELS.has(modelId)
}

function assertNoUnsupportedOptions(options: BailianGenerateRequestOptions): void {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    'resolution',
    'size',
    'watermark',
    'promptExtend',
    'duration',
    'lastFrameImageUrl',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`BAILIAN_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function buildSubmitRequest(params: BailianVideoGenerateParams): {
  endpoint: string
  body: BailianVideoSubmitBody
} {
  const imageUrl = readTrimmedString(params.imageUrl)
  if (!imageUrl) {
    throw new Error('BAILIAN_VIDEO_IMAGE_URL_REQUIRED')
  }
  const modelId = readTrimmedString(params.options.modelId)
  if (!modelId) {
    throw new Error('BAILIAN_VIDEO_MODEL_ID_REQUIRED')
  }

  const firstFrameUrl = toFetchableUrl(imageUrl)
  const kf2v = isKf2vModel(modelId)
  const lastFrameImageUrl = readTrimmedString(params.options.lastFrameImageUrl)
  if (kf2v && !lastFrameImageUrl) {
    throw new Error('BAILIAN_VIDEO_LAST_FRAME_IMAGE_URL_REQUIRED')
  }
  if (!kf2v && lastFrameImageUrl) {
    throw new Error(`BAILIAN_VIDEO_LAST_FRAME_UNSUPPORTED_FOR_MODEL: ${modelId}`)
  }

  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  const resolution = readTrimmedString(params.options.resolution)
  const size = readTrimmedString(params.options.size)
  const watermark = readOptionalBoolean(params.options.watermark)
  const promptExtend = readOptionalBoolean(params.options.promptExtend)
  const duration = readOptionalPositiveInteger(params.options.duration, 'duration')

  const submitBody: BailianVideoSubmitBody = {
    model: modelId,
    input: kf2v
      ? {
        first_frame_url: firstFrameUrl,
        last_frame_url: toFetchableUrl(lastFrameImageUrl),
      }
      : {
        img_url: firstFrameUrl,
      },
  }
  if (prompt) {
    submitBody.input.prompt = prompt
  }

  const submitParameters: BailianVideoSubmitParameters = {}
  if (resolution) {
    submitParameters.resolution = resolution
  }
  if (size) {
    submitParameters.size = size
  }
  if (typeof watermark === 'boolean') {
    submitParameters.watermark = watermark
  }
  if (typeof promptExtend === 'boolean') {
    submitParameters.prompt_extend = promptExtend
  }
  if (typeof duration === 'number') {
    submitParameters.duration = duration
  }
  if (Object.keys(submitParameters).length > 0) {
    submitBody.parameters = submitParameters
  }

  return {
    endpoint: kf2v ? BAILIAN_KF2V_ENDPOINT : BAILIAN_VIDEO_ENDPOINT,
    body: submitBody,
  }
}

async function parseSubmitResponse(response: Response): Promise<BailianVideoSubmitResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_VIDEO_RESPONSE_INVALID')
    }
    return parsed as BailianVideoSubmitResponse
  } catch {
    throw new Error('BAILIAN_VIDEO_RESPONSE_INVALID_JSON')
  }
}

export async function generateBailianVideo(params: BailianVideoGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)
  assertNoUnsupportedOptions(params.options)

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const submitRequest = buildSubmitRequest(params)
  const response = await fetch(submitRequest.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(submitRequest.body),
  })
  const data = await parseSubmitResponse(response)

  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_VIDEO_SUBMIT_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  const taskId = readTrimmedString(data.output?.task_id)
  if (!taskId) {
    throw new Error('BAILIAN_VIDEO_TASK_ID_MISSING')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `BAILIAN:VIDEO:${taskId}`,
  }
}
