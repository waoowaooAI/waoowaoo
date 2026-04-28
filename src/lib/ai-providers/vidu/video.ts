import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type { AiProviderVideoExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'

const VIDU_BASE_URL = 'https://api.vidu.cn/ent/v2'
const VIDU_STANDARD_RATIOS = new Set(['16:9', '9:16', '1:1'])
const VIDU_Q2_EXTRA_RATIOS = new Set(['4:3', '3:4', '21:9', '2:3', '3:2', 'auto'])
const VIDU_AUDIO_TYPES = new Set(['all', 'speech_only', 'sound_effect_only'])
const VIDU_MOVEMENT_AMPLITUDES = new Set(['auto', 'small', 'medium', 'large'])
const VIDU_RATIO_PATTERN = /^(\d{1,4}):(\d{1,4})$/

const MAX_PROMPT_LENGTH = 5000
const MAX_PAYLOAD_LENGTH = 1048576

type ViduGenerationMode = 'normal' | 'firstlastframe'
type ViduAudioType = 'all' | 'speech_only' | 'sound_effect_only'
type ViduMovementAmplitude = 'auto' | 'small' | 'medium' | 'large'
type ViduAspectRatioProfile = 'standard' | 'q2-flex'

type ViduResolutionRule = {
  defaultResolution: string
  resolutionOptions: readonly string[]
}

type ViduModeSpec = {
  defaultDuration: number
  durationOptions: readonly number[]
  resolutionRulesByDuration: Readonly<Record<number, ViduResolutionRule>>
}

type ViduModelSpec = {
  aspectRatioProfile: ViduAspectRatioProfile
  supportsFirstLastFrame: boolean
  supportsGenerateAudio: boolean
  defaultAudioByMode: Record<ViduGenerationMode, boolean>
  normalMode: ViduModeSpec
  firstLastMode?: ViduModeSpec
}

type ViduVideoOptions = NonNullable<AiProviderVideoExecutionContext['options']> & {
  modelId?: string
  aspect_ratio?: string
  audio?: boolean
  audioType?: ViduAudioType
  audio_type?: ViduAudioType
  generationMode?: ViduGenerationMode
  isRec?: boolean
  is_rec?: boolean
  movementAmplitude?: ViduMovementAmplitude
  movement_amplitude?: ViduMovementAmplitude
  offPeak?: boolean
  off_peak?: boolean
  wmPosition?: number
  wm_position?: number
  wmUrl?: string
  wm_url?: string
  metaData?: string
  meta_data?: string
  callbackUrl?: string
  callback_url?: string
  voiceId?: string
  voice_id?: string
  prompt?: string
  fps?: number
}

type ViduRequestBody = {
  model: string
  images: string[]
  prompt?: string
  duration: number
  resolution: string
  aspect_ratio?: string
  seed?: number
  audio?: boolean
  audio_type?: ViduAudioType
  voice_id?: string
  is_rec?: boolean
  movement_amplitude?: ViduMovementAmplitude
  bgm?: boolean
  payload?: string
  off_peak?: boolean
  watermark?: boolean
  wm_position?: number
  wm_url?: string
  meta_data?: string
  callback_url?: string
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function range(start: number, end: number): number[] {
  const out: number[] = []
  for (let value = start; value <= end; value += 1) out.push(value)
  return out
}

function pickFirstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) return value
  }
  return undefined
}

function buildUniformModeSpec(input: {
  durationOptions: readonly number[]
  defaultDuration: number
  resolutionOptions: readonly string[]
  defaultResolution: string
}): ViduModeSpec {
  const resolutionRulesByDuration: Record<number, ViduResolutionRule> = {}
  for (const duration of input.durationOptions) {
    resolutionRulesByDuration[duration] = {
      defaultResolution: input.defaultResolution,
      resolutionOptions: input.resolutionOptions,
    }
  }
  return {
    defaultDuration: input.defaultDuration,
    durationOptions: input.durationOptions,
    resolutionRulesByDuration,
  }
}

function buildVidu20ModeSpec(): ViduModeSpec {
  return {
    defaultDuration: 4,
    durationOptions: [4, 8],
    resolutionRulesByDuration: {
      4: { defaultResolution: '360p', resolutionOptions: ['360p', '720p', '1080p'] },
      8: { defaultResolution: '720p', resolutionOptions: ['720p'] },
    },
  }
}

const Q3_DURATIONS = range(1, 16)
const Q2_NORMAL_DURATIONS = range(1, 10)
const Q2_FIRSTLAST_DURATIONS = range(1, 8)

const VIDU_MODEL_SPECS: Record<string, ViduModelSpec> = {
  'viduq3-pro': {
    aspectRatioProfile: 'standard',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: true,
    defaultAudioByMode: { normal: true, firstlastframe: true },
    normalMode: buildUniformModeSpec({
      durationOptions: Q3_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['540p', '720p', '1080p'],
      defaultResolution: '720p',
    }),
    firstLastMode: buildUniformModeSpec({
      durationOptions: Q3_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['540p', '720p', '1080p'],
      defaultResolution: '720p',
    }),
  },
  'viduq2-pro-fast': {
    aspectRatioProfile: 'q2-flex',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: true,
    defaultAudioByMode: { normal: false, firstlastframe: false },
    normalMode: buildUniformModeSpec({
      durationOptions: Q2_NORMAL_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['720p', '1080p'],
      defaultResolution: '720p',
    }),
    firstLastMode: buildUniformModeSpec({
      durationOptions: Q2_FIRSTLAST_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['720p', '1080p'],
      defaultResolution: '720p',
    }),
  },
  'viduq2-pro': {
    aspectRatioProfile: 'q2-flex',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: true,
    defaultAudioByMode: { normal: false, firstlastframe: false },
    normalMode: buildUniformModeSpec({
      durationOptions: Q2_NORMAL_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['540p', '720p', '1080p'],
      defaultResolution: '720p',
    }),
    firstLastMode: buildUniformModeSpec({
      durationOptions: Q2_FIRSTLAST_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['540p', '720p', '1080p'],
      defaultResolution: '720p',
    }),
  },
  'viduq2-turbo': {
    aspectRatioProfile: 'q2-flex',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: true,
    defaultAudioByMode: { normal: false, firstlastframe: false },
    normalMode: buildUniformModeSpec({
      durationOptions: Q2_NORMAL_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['540p', '720p', '1080p'],
      defaultResolution: '720p',
    }),
    firstLastMode: buildUniformModeSpec({
      durationOptions: Q2_FIRSTLAST_DURATIONS,
      defaultDuration: 5,
      resolutionOptions: ['540p', '720p', '1080p'],
      defaultResolution: '720p',
    }),
  },
  'viduq1': {
    aspectRatioProfile: 'standard',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: false,
    defaultAudioByMode: { normal: false, firstlastframe: false },
    normalMode: buildUniformModeSpec({
      durationOptions: [5],
      defaultDuration: 5,
      resolutionOptions: ['1080p'],
      defaultResolution: '1080p',
    }),
    firstLastMode: buildUniformModeSpec({
      durationOptions: [5],
      defaultDuration: 5,
      resolutionOptions: ['1080p'],
      defaultResolution: '1080p',
    }),
  },
  'viduq1-classic': {
    aspectRatioProfile: 'standard',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: false,
    defaultAudioByMode: { normal: false, firstlastframe: false },
    normalMode: buildUniformModeSpec({
      durationOptions: [5],
      defaultDuration: 5,
      resolutionOptions: ['1080p'],
      defaultResolution: '1080p',
    }),
    firstLastMode: buildUniformModeSpec({
      durationOptions: [5],
      defaultDuration: 5,
      resolutionOptions: ['1080p'],
      defaultResolution: '1080p',
    }),
  },
  'vidu2.0': {
    aspectRatioProfile: 'standard',
    supportsFirstLastFrame: true,
    supportsGenerateAudio: false,
    defaultAudioByMode: { normal: false, firstlastframe: false },
    normalMode: buildVidu20ModeSpec(),
    firstLastMode: buildVidu20ModeSpec(),
  },
}

function isQ3Model(modelId: string): boolean {
  return modelId.startsWith('viduq3')
}

function resolveGenerationMode(lastFrameImageUrl: string | undefined): ViduGenerationMode {
  return lastFrameImageUrl ? 'firstlastframe' : 'normal'
}

function normalizeGenerationMode(raw: unknown): ViduGenerationMode | undefined {
  if (raw === undefined) return undefined
  if (raw === 'normal' || raw === 'firstlastframe') return raw
  throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${String(raw)}`)
}

function resolveViduEndpoint(mode: ViduGenerationMode): string {
  return mode === 'firstlastframe' ? '/start-end2video' : '/img2video'
}

function resolveModeSpec(modelSpec: ViduModelSpec, mode: ViduGenerationMode): ViduModeSpec {
  if (mode === 'normal') return modelSpec.normalMode
  const firstLastMode = modelSpec.firstLastMode
  if (!firstLastMode) {
    throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: firstlastframe')
  }
  return firstLastMode
}

function resolveResolutionRule(modeSpec: ViduModeSpec, duration: number): ViduResolutionRule {
  const rule = modeSpec.resolutionRulesByDuration[duration]
  if (!rule) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration}`)
  }
  return rule
}

function isRatioAllowedByProfile(profile: ViduAspectRatioProfile, ratio: string): boolean {
  if (VIDU_STANDARD_RATIOS.has(ratio)) return true
  if (profile !== 'q2-flex') return false
  if (VIDU_Q2_EXTRA_RATIOS.has(ratio)) return true
  const match = ratio.match(VIDU_RATIO_PATTERN)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
}

function normalizeOptionalString(raw: unknown): string | undefined {
  if (raw === undefined) return undefined
  if (!isNonEmptyString(raw)) {
    throw new Error(`VIDU_VIDEO_OPTION_INVALID: expected non-empty string, got ${String(raw)}`)
  }
  return raw.trim()
}

function normalizeOptionalBoolean(raw: unknown, field: string): boolean | undefined {
  if (raw === undefined) return undefined
  if (!isBoolean(raw)) {
    throw new Error(`VIDU_VIDEO_OPTION_INVALID: ${field} must be boolean`)
  }
  return raw
}

function assertAllowedViduVideoOptions(options: ViduVideoOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'duration',
    'resolution',
    'aspectRatio',
    'aspect_ratio',
    'generateAudio',
    'audio',
    'audioType',
    'audio_type',
    'generationMode',
    'lastFrameImageUrl',
    'seed',
    'movementAmplitude',
    'movement_amplitude',
    'bgm',
    'isRec',
    'is_rec',
    'voiceId',
    'voice_id',
    'payload',
    'offPeak',
    'off_peak',
    'watermark',
    'wmPosition',
    'wm_position',
    'wmUrl',
    'wm_url',
    'metaData',
    'meta_data',
    'callbackUrl',
    'callback_url',
    'prompt',
    'fps',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

export async function executeViduVideoGeneration(input: AiProviderVideoExecutionContext): Promise<GenerateResult> {
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  const rawOptions: ViduVideoOptions = input.options ?? {}
  assertAllowedViduVideoOptions(rawOptions)

  const prompt = typeof rawOptions.prompt === 'string' ? rawOptions.prompt : ''
  const modelId = input.selection.modelId || rawOptions.modelId || 'viduq2-turbo'
  const modelSpec = VIDU_MODEL_SPECS[modelId]
  if (!modelSpec) {
    throw new Error(`VIDU_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
  }

  const lastFrameImageUrl = normalizeOptionalString(rawOptions.lastFrameImageUrl)
  const inferredGenerationMode = resolveGenerationMode(lastFrameImageUrl)
  const requestedGenerationMode = normalizeGenerationMode(rawOptions.generationMode)
  if (requestedGenerationMode && requestedGenerationMode !== inferredGenerationMode) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${requestedGenerationMode}`)
  }
  const generationMode = requestedGenerationMode || inferredGenerationMode

  if (generationMode === 'firstlastframe' && !modelSpec.supportsFirstLastFrame) {
    throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: firstlastframe for ${modelId}`)
  }

  const modeSpec = resolveModeSpec(modelSpec, generationMode)

  if (rawOptions.duration !== undefined && !isInteger(rawOptions.duration)) {
    throw new Error('VIDU_VIDEO_OPTION_INVALID: duration must be integer')
  }
  const duration = rawOptions.duration ?? modeSpec.defaultDuration
  if (!modeSpec.durationOptions.includes(duration)) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration}`)
  }

  const resolutionRule = resolveResolutionRule(modeSpec, duration)
  const rawResolution = rawOptions.resolution
  if (rawResolution !== undefined && !isNonEmptyString(rawResolution)) {
    throw new Error('VIDU_VIDEO_OPTION_INVALID: resolution must be non-empty string')
  }
  const pickedResolution = rawResolution ? rawResolution.trim() : resolutionRule.defaultResolution
  if (!resolutionRule.resolutionOptions.includes(pickedResolution)) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: resolution=${pickedResolution}`)
  }

  const pickedAspectRatio = pickFirstDefined(rawOptions.aspectRatio, rawOptions.aspect_ratio)
  if (pickedAspectRatio !== undefined) {
    if (!isNonEmptyString(pickedAspectRatio)) {
      throw new Error('VIDU_VIDEO_OPTION_INVALID: aspectRatio must be non-empty string')
    }
    const normalizedRatio = pickedAspectRatio.trim()
    if (!isRatioAllowedByProfile(modelSpec.aspectRatioProfile, normalizedRatio)) {
      throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: aspectRatio=${normalizedRatio}`)
    }
  }

  if (rawOptions.seed !== undefined && !isInteger(rawOptions.seed)) {
    throw new Error('VIDU_VIDEO_OPTION_INVALID: seed must be integer')
  }

  const rawGenerateAudio = pickFirstDefined(rawOptions.generateAudio, rawOptions.audio)
  if (rawGenerateAudio !== undefined && !isBoolean(rawGenerateAudio)) {
    throw new Error('VIDU_VIDEO_OPTION_INVALID: generateAudio must be boolean')
  }
  const resolvedGenerateAudio = rawGenerateAudio ?? modelSpec.defaultAudioByMode[generationMode]
  if (resolvedGenerateAudio && !modelSpec.supportsGenerateAudio) {
    throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: generateAudio for ${modelId}`)
  }

  const rawAudioType = pickFirstDefined(rawOptions.audioType, rawOptions.audio_type)
  let resolvedAudioType: ViduAudioType | undefined
  if (rawAudioType !== undefined) {
    if (!isNonEmptyString(rawAudioType)) {
      throw new Error('VIDU_VIDEO_OPTION_INVALID: audioType must be non-empty string')
    }
    if (!VIDU_AUDIO_TYPES.has(rawAudioType)) {
      throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: audioType=${rawAudioType}`)
    }
    if (!resolvedGenerateAudio) {
      throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: audioType requires generateAudio=true')
    }
    resolvedAudioType = rawAudioType
  }

  const movementAmplitudeRaw = pickFirstDefined(rawOptions.movementAmplitude, rawOptions.movement_amplitude)
  const movementAmplitude = movementAmplitudeRaw ? normalizeOptionalString(movementAmplitudeRaw) as ViduMovementAmplitude : undefined
  if (movementAmplitude !== undefined && !VIDU_MOVEMENT_AMPLITUDES.has(movementAmplitude)) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: movementAmplitude=${movementAmplitude}`)
  }

  const bgm = normalizeOptionalBoolean(rawOptions.bgm, 'bgm')
  const isRec = normalizeOptionalBoolean(pickFirstDefined(rawOptions.isRec, rawOptions.is_rec), 'isRec')
  const offPeak = normalizeOptionalBoolean(pickFirstDefined(rawOptions.offPeak, rawOptions.off_peak), 'offPeak')
  const watermark = normalizeOptionalBoolean(rawOptions.watermark, 'watermark')

  if (offPeak === true && isQ3Model(modelId) && !resolvedGenerateAudio) {
    throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: offPeak for Q3 requires generateAudio=true')
  }

  const voiceId = normalizeOptionalString(pickFirstDefined(rawOptions.voiceId, rawOptions.voice_id))
  if (voiceId && !resolvedGenerateAudio) {
    throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: voiceId requires generateAudio=true')
  }

  const payload = normalizeOptionalString(rawOptions.payload)
  if (payload && payload.length > MAX_PAYLOAD_LENGTH) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: payload length > ${MAX_PAYLOAD_LENGTH}`)
  }

  const wmPositionRaw = pickFirstDefined(rawOptions.wmPosition, rawOptions.wm_position)
  if (wmPositionRaw !== undefined && !isInteger(wmPositionRaw)) {
    throw new Error('VIDU_VIDEO_OPTION_INVALID: wmPosition must be integer')
  }
  const wmPosition = wmPositionRaw
  if (wmPosition !== undefined && (wmPosition < 1 || wmPosition > 4)) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: wmPosition=${wmPosition}`)
  }

  const wmUrl = normalizeOptionalString(pickFirstDefined(rawOptions.wmUrl, rawOptions.wm_url))
  const metaData = normalizeOptionalString(pickFirstDefined(rawOptions.metaData, rawOptions.meta_data))
  const callbackUrl = normalizeOptionalString(pickFirstDefined(rawOptions.callbackUrl, rawOptions.callback_url))

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: prompt length > ${MAX_PROMPT_LENGTH}`)
  }

  const logPrefix = `[Vidu Video ${modelId}]`

  const firstFrameDataUrl = input.imageUrl.startsWith('data:')
    ? input.imageUrl
    : await normalizeToBase64ForGeneration(input.imageUrl)
  const images: string[] = [firstFrameDataUrl]
  if (generationMode === 'firstlastframe') {
    if (!lastFrameImageUrl) {
      throw new Error('VIDU_VIDEO_OPTION_REQUIRED: lastFrameImageUrl')
    }
    images.push(
      lastFrameImageUrl.startsWith('data:')
        ? lastFrameImageUrl
        : await normalizeToBase64ForGeneration(lastFrameImageUrl),
    )
  }

  const requestBody: ViduRequestBody = {
    model: modelId,
    images,
    duration,
    resolution: pickedResolution,
    ...(prompt ? { prompt } : {}),
    ...(pickedAspectRatio ? { aspect_ratio: pickedAspectRatio } : {}),
    ...(rawOptions.seed !== undefined ? { seed: rawOptions.seed } : {}),
    ...(modelSpec.supportsGenerateAudio || rawGenerateAudio !== undefined ? { audio: resolvedGenerateAudio } : {}),
    ...(resolvedAudioType ? { audio_type: resolvedAudioType } : {}),
    ...(voiceId ? { voice_id: voiceId } : {}),
    ...(isRec !== undefined ? { is_rec: isRec } : {}),
    ...(movementAmplitude ? { movement_amplitude: movementAmplitude } : {}),
    ...(bgm !== undefined ? { bgm } : {}),
    ...(payload ? { payload } : {}),
    ...(offPeak !== undefined ? { off_peak: offPeak } : {}),
    ...(watermark !== undefined ? { watermark } : {}),
    ...(wmPosition !== undefined ? { wm_position: wmPosition } : {}),
    ...(wmUrl ? { wm_url: wmUrl } : {}),
    ...(metaData ? { meta_data: metaData } : {}),
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  }

  const endpoint = resolveViduEndpoint(generationMode)
  _ulogInfo(`${logPrefix} submit task endpoint=${endpoint}`)

  const response = await fetch(`${VIDU_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    _ulogError(`${logPrefix} API request failed`, response.status, errorText)
    throw new Error(`Vidu API Error: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as unknown
  const taskId = typeof (data as { task_id?: unknown }).task_id === 'string' ? String((data as { task_id?: unknown }).task_id) : ''
  if (!taskId) {
    throw new Error('Vidu未返回task_id')
  }

  const state = typeof (data as { state?: unknown }).state === 'string' ? String((data as { state?: unknown }).state) : ''
  if (state === 'failed') {
    throw new Error('Vidu: 任务提交失败')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `VIDU:VIDEO:${taskId}`,
  }
}
