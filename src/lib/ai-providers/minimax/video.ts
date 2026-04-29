import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'
type MinimaxVideoGenerationMode = 'normal' | 'firstlastframe'
type MinimaxResolution = '512P' | '720P' | '768P' | '1080P'

type MinimaxVideoOptions = NonNullable<AiProviderVideoExecutionContext['options']> & {
  generationMode?: MinimaxVideoGenerationMode
  serviceTier?: string
}

type MinimaxResolutionDurationRule = {
  resolution: MinimaxResolution
  durations: readonly number[]
}

type MinimaxVideoModelSpec = {
  apiModel: string
  supportsImageInput: boolean
  supportsFirstLastFrame: boolean
  normalRules: readonly MinimaxResolutionDurationRule[]
  firstLastFrameRules?: readonly MinimaxResolutionDurationRule[]
}

const MINIMAX_VIDEO_MODEL_SPECS: Record<string, MinimaxVideoModelSpec> = {
  'minimax-hailuo-2.3': {
    apiModel: 'MiniMax-Hailuo-2.3',
    supportsImageInput: true,
    supportsFirstLastFrame: false,
    normalRules: [
      { resolution: '768P', durations: [6, 10] },
      { resolution: '1080P', durations: [6] },
    ],
  },
  'minimax-hailuo-2.3-fast': {
    apiModel: 'MiniMax-Hailuo-2.3-Fast',
    supportsImageInput: true,
    supportsFirstLastFrame: false,
    normalRules: [
      { resolution: '768P', durations: [6, 10] },
      { resolution: '1080P', durations: [6] },
    ],
  },
  'minimax-hailuo-02': {
    apiModel: 'MiniMax-Hailuo-02',
    supportsImageInput: true,
    supportsFirstLastFrame: true,
    normalRules: [
      { resolution: '512P', durations: [6, 10] },
      { resolution: '768P', durations: [6, 10] },
      { resolution: '1080P', durations: [6] },
    ],
    firstLastFrameRules: [
      { resolution: '768P', durations: [6, 10] },
      { resolution: '1080P', durations: [6] },
    ],
  },
  't2v-01': {
    apiModel: 'T2V-01',
    supportsImageInput: false,
    supportsFirstLastFrame: false,
    normalRules: [
      { resolution: '720P', durations: [6] },
    ],
  },
  't2v-01-director': {
    apiModel: 'T2V-01-Director',
    supportsImageInput: false,
    supportsFirstLastFrame: false,
    normalRules: [
      { resolution: '720P', durations: [6] },
    ],
  },
}

type MinimaxVideoGenerationRequest = {
  model: string
  prompt: string
  prompt_optimizer: boolean
  duration?: number
  resolution?: MinimaxResolution
  first_frame_image?: string
  last_frame_image?: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getVideoModelSpec(modelId: string): MinimaxVideoModelSpec {
  const spec = MINIMAX_VIDEO_MODEL_SPECS[modelId]
  if (!spec) {
    throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: modelId=${modelId}`)
  }
  return spec
}

function normalizeGenerationMode(raw: unknown): MinimaxVideoGenerationMode {
  if (raw === undefined || raw === null || raw === '') return 'normal'
  if (raw === 'normal' || raw === 'firstlastframe') return raw
  throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${String(raw)}`)
}

function normalizeResolution(raw: string): MinimaxResolution {
  const normalized = raw.trim().toLowerCase()
  if (normalized.includes('512')) return '512P'
  if (normalized.includes('768')) return '768P'
  if (normalized.includes('720')) return '720P'
  if (normalized.includes('1080')) return '1080P'
  throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: resolution=${raw}`)
}

function pickRulesByMode(
  modelId: string,
  spec: MinimaxVideoModelSpec,
  mode: MinimaxVideoGenerationMode,
): readonly MinimaxResolutionDurationRule[] {
  if (mode === 'normal') return spec.normalRules
  if (!spec.supportsFirstLastFrame) {
    throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: generationMode=${mode} for ${modelId}`)
  }
  return spec.firstLastFrameRules || []
}

function validateResolutionAndDuration(input: {
  modelId: string
  rules: readonly MinimaxResolutionDurationRule[]
  resolution?: MinimaxResolution
  duration?: number
}) {
  const { modelId, rules, resolution, duration } = input
  if (rules.length === 0) {
    throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: no rules for ${modelId}`)
  }

  if (resolution) {
    const matchedResolutionRule = rules.find((rule) => rule.resolution === resolution)
    if (!matchedResolutionRule) {
      throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: resolution=${resolution} for ${modelId}`)
    }
    if (typeof duration === 'number' && !matchedResolutionRule.durations.includes(duration)) {
      throw new Error(
        `MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration} for resolution=${resolution} in ${modelId}`,
      )
    }
    return
  }

  if (typeof duration !== 'number') return

  const supportsDuration = rules.some((rule) => rule.durations.includes(duration))
  if (!supportsDuration) {
    throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration} for ${modelId}`)
  }
}

function assertAllowedMinimaxVideoOptions(options: MinimaxVideoOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'duration',
    'resolution',
    'generationMode',
    'generateAudio',
    'lastFrameImageUrl',
    'aspectRatio',
    'prompt',
    'fps',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

export async function executeMinimaxVideoGeneration(input: AiProviderVideoExecutionContext) {
  const options: MinimaxVideoOptions = input.options ?? {}
  assertAllowedMinimaxVideoOptions(options)

  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  const prompt = typeof options.prompt === 'string' ? options.prompt : ''

  const modelId = requireSelectedModelId(input.selection, 'minimax:video')

  const duration = options.duration
  const resolution = options.resolution
  const rawGenerationMode = options.generationMode
  const generateAudio = options.generateAudio
  const lastFrameImageUrl = options.lastFrameImageUrl

  const modelSpec = getVideoModelSpec(modelId)
  const inferredGenerationMode: MinimaxVideoGenerationMode = isNonEmptyString(lastFrameImageUrl)
    ? 'firstlastframe'
    : 'normal'
  const generationMode = rawGenerationMode === undefined
    ? inferredGenerationMode
    : normalizeGenerationMode(rawGenerationMode)
  if (rawGenerationMode !== undefined && generationMode !== inferredGenerationMode) {
    throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${String(rawGenerationMode)}`)
  }

  const resolvedRules = pickRulesByMode(modelId, modelSpec, generationMode)
  const normalizedResolution = resolution ? normalizeResolution(resolution) : undefined
  const hasFirstFrameImage = isNonEmptyString(input.imageUrl)
  validateResolutionAndDuration({
    modelId,
    rules: resolvedRules,
    resolution: normalizedResolution,
    duration,
  })

  if (generateAudio === true) {
    throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: generateAudio for ${modelId}`)
  }
  if (generateAudio !== undefined && typeof generateAudio !== 'boolean') {
    throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: generateAudio=${String(generateAudio)}`)
  }
  if (generationMode === 'firstlastframe' && !isNonEmptyString(lastFrameImageUrl)) {
    throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: lastFrameImageUrl')
  }
  if (generationMode === 'normal' && lastFrameImageUrl !== undefined) {
    throw new Error('MINIMAX_VIDEO_OPTION_UNSUPPORTED: lastFrameImageUrl for normal mode')
  }
  if (generationMode === 'firstlastframe' && !hasFirstFrameImage) {
    throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: firstFrameImage')
  }
  if (
    modelId === 'minimax-hailuo-02'
    && generationMode === 'normal'
    && normalizedResolution === '512P'
    && !hasFirstFrameImage
  ) {
    throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: firstFrameImage for resolution=512P')
  }

  const logPrefix = `[MiniMax Video ${modelId}]`
  const requestBody: MinimaxVideoGenerationRequest = {
    model: modelSpec.apiModel,
    prompt,
    prompt_optimizer: true,
    ...(typeof duration === 'number' ? { duration } : {}),
    ...(normalizedResolution ? { resolution: normalizedResolution } : {}),
  }

  if (modelSpec.supportsImageInput && hasFirstFrameImage) {
    const firstFrameDataUrl = input.imageUrl.startsWith('data:')
      ? input.imageUrl
      : await normalizeToBase64ForGeneration(input.imageUrl)
    requestBody.first_frame_image = firstFrameDataUrl
    if (generationMode === 'firstlastframe' && isNonEmptyString(lastFrameImageUrl)) {
      requestBody.last_frame_image = lastFrameImageUrl.startsWith('data:')
        ? lastFrameImageUrl
        : await normalizeToBase64ForGeneration(lastFrameImageUrl)
    }
  }

  _ulogInfo(
    `${logPrefix} submit task mode=${generationMode} duration=${duration ?? '(provider default)'} resolution=${normalizedResolution ?? '(provider default)'}`,
  )

  const response = await fetch(`${MINIMAX_BASE_URL}/video_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    _ulogError(`${logPrefix} API request failed`, response.status, errorText)
    throw new Error(`MiniMax API Error: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as unknown
  const baseResp = typeof data === 'object' && data !== null ? (data as { base_resp?: unknown }).base_resp : undefined
  const statusCode = typeof baseResp === 'object' && baseResp !== null ? (baseResp as { status_code?: unknown }).status_code : undefined
  if (statusCode !== 0) {
    const statusMsg = typeof baseResp === 'object' && baseResp !== null ? (baseResp as { status_msg?: unknown }).status_msg : undefined
    throw new Error(`MiniMax: ${typeof statusMsg === 'string' ? statusMsg : '未知错误'}`)
  }

  const taskId = typeof (data as { task_id?: unknown }).task_id === 'string' ? String((data as { task_id?: unknown }).task_id) : ''
  if (!taskId) {
    throw new Error('MiniMax未返回task_id')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `MINIMAX:VIDEO:${taskId}`,
  }
}
