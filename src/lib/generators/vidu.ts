import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
/**
 * Vidu 视频生成器
 */

import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from './base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'

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

interface ViduModelSpec {
    aspectRatioProfile: ViduAspectRatioProfile
    supportsFirstLastFrame: boolean
    supportsGenerateAudio: boolean
    defaultAudioByMode: Record<ViduGenerationMode, boolean>
    normalMode: ViduModeSpec
    firstLastMode?: ViduModeSpec
}

interface ViduVideoOptions {
    modelId?: string
    duration?: number
    resolution?: string
    aspectRatio?: string
    aspect_ratio?: string
    generateAudio?: boolean
    audio?: boolean
    audioType?: ViduAudioType
    audio_type?: ViduAudioType
    generationMode?: ViduGenerationMode
    lastFrameImageUrl?: string
    seed?: number
    movementAmplitude?: ViduMovementAmplitude
    movement_amplitude?: ViduMovementAmplitude
    bgm?: boolean
    isRec?: boolean
    is_rec?: boolean
    voiceId?: string
    voice_id?: string
    payload?: string
    offPeak?: boolean
    off_peak?: boolean
    watermark?: boolean
    wmPosition?: number
    wm_position?: number
    wmUrl?: string
    wm_url?: string
    metaData?: string
    meta_data?: string
    callbackUrl?: string
    callback_url?: string
}

interface ViduRequestBody {
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
    for (let value = start; value <= end; value += 1) {
        out.push(value)
    }
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
            4: {
                defaultResolution: '360p',
                resolutionOptions: ['360p', '720p', '1080p'],
            },
            8: {
                defaultResolution: '720p',
                resolutionOptions: ['720p'],
            },
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
        defaultAudioByMode: {
            normal: true,
            firstlastframe: true,
        },
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
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
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
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
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
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
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
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
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
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
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
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
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

export class ViduVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const { apiKey } = await getProviderConfig(userId, 'vidu')
        const rawOptions = options as ViduVideoOptions

        const modelId = rawOptions.modelId || 'viduq2-turbo'
        const modelSpec = VIDU_MODEL_SPECS[modelId]
        if (!modelSpec) {
            throw new Error(`VIDU_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
        }

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
        ])

        for (const [key, value] of Object.entries(options)) {
            if (value === undefined) continue
            if (!allowedOptionKeys.has(key)) {
                throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: ${key}`)
            }
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

        const rawDuration = rawOptions.duration
        if (rawDuration !== undefined) {
            if (!isInteger(rawDuration)) {
                throw new Error('VIDU_VIDEO_OPTION_INVALID: duration must be integer')
            }
        }
        const duration = rawDuration ?? modeSpec.defaultDuration
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
        }
        const resolvedAudioType = resolvedGenerateAudio
            ? ((rawAudioType || 'all') as ViduAudioType)
            : undefined

        const movementAmplitude = pickFirstDefined(rawOptions.movementAmplitude, rawOptions.movement_amplitude)
        if (movementAmplitude !== undefined) {
            if (!isNonEmptyString(movementAmplitude)) {
                throw new Error('VIDU_VIDEO_OPTION_INVALID: movementAmplitude must be non-empty string')
            }
            if (!VIDU_MOVEMENT_AMPLITUDES.has(movementAmplitude)) {
                throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: movementAmplitude=${movementAmplitude}`)
            }
        }

        const bgm = normalizeOptionalBoolean(rawOptions.bgm, 'bgm')
        const isRec = normalizeOptionalBoolean(pickFirstDefined(rawOptions.isRec, rawOptions.is_rec), 'isRec')
        const offPeak = normalizeOptionalBoolean(pickFirstDefined(rawOptions.offPeak, rawOptions.off_peak), 'offPeak')
        const watermark = normalizeOptionalBoolean(rawOptions.watermark, 'watermark')

        if (offPeak === true && resolvedGenerateAudio) {
            if (!isQ3Model(modelId)) {
                throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: offPeak with generateAudio=true for non-Q3 model')
            }
        }
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

        const firstFrameDataUrl = imageUrl.startsWith('data:') ? imageUrl : await imageUrlToBase64(imageUrl)
        const images: string[] = [firstFrameDataUrl]
        if (generationMode === 'firstlastframe') {
            if (!lastFrameImageUrl) {
                throw new Error('VIDU_VIDEO_OPTION_REQUIRED: lastFrameImageUrl')
            }
            images.push(
                lastFrameImageUrl.startsWith('data:')
                    ? lastFrameImageUrl
                    : await imageUrlToBase64(lastFrameImageUrl),
            )
        }

        const requestBody: ViduRequestBody = {
            model: modelId,
            images,
            duration,
            resolution: pickedResolution,
        }

        if (prompt) {
            requestBody.prompt = prompt
        }
        if (pickedAspectRatio) {
            requestBody.aspect_ratio = pickedAspectRatio
        }
        if (rawOptions.seed !== undefined) {
            requestBody.seed = rawOptions.seed
        }
        if (modelSpec.supportsGenerateAudio || rawGenerateAudio !== undefined) {
            requestBody.audio = resolvedGenerateAudio
        }
        if (resolvedAudioType) {
            requestBody.audio_type = resolvedAudioType
        }
        if (voiceId) {
            requestBody.voice_id = voiceId
        }
        if (isRec !== undefined) {
            requestBody.is_rec = isRec
        }
        if (movementAmplitude) {
            requestBody.movement_amplitude = movementAmplitude
        }
        if (bgm !== undefined) {
            requestBody.bgm = bgm
        }
        if (payload) {
            requestBody.payload = payload
        }
        if (offPeak !== undefined) {
            requestBody.off_peak = offPeak
        }
        if (watermark !== undefined) {
            requestBody.watermark = watermark
        }
        if (wmPosition !== undefined) {
            requestBody.wm_position = wmPosition
        }
        if (wmUrl) {
            requestBody.wm_url = wmUrl
        }
        if (metaData) {
            requestBody.meta_data = metaData
        }
        if (callbackUrl) {
            requestBody.callback_url = callbackUrl
        }

        const endpoint = resolveViduEndpoint(generationMode)

        _ulogInfo(`${logPrefix} 提交任务`)
        _ulogInfo(`${logPrefix} - Model: ${modelId}`)
        _ulogInfo(`${logPrefix} - Duration: ${duration}s`)
        _ulogInfo(`${logPrefix} - Resolution: ${pickedResolution}`)
        _ulogInfo(`${logPrefix} - Mode: ${generationMode}`)
        _ulogInfo(`${logPrefix} - GenerateAudio: ${resolvedGenerateAudio}`)
        _ulogInfo(`${logPrefix} - 完整请求体:`, JSON.stringify(requestBody, null, 2))

        try {
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
                _ulogError(`${logPrefix} API请求失败:`, response.status, errorText)
                throw new Error(`Vidu API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            const taskId = data.task_id
            if (!taskId) {
                _ulogError(`${logPrefix} 响应中缺少 task_id:`, data)
                throw new Error('Vidu未返回task_id')
            }

            const state = data.state
            if (state === 'failed') {
                _ulogError(`${logPrefix} 任务提交失败:`, data)
                throw new Error('Vidu: 任务提交失败')
            }

            _ulogInfo(`${logPrefix} 任务已提交，task_id=${taskId}, state=${state}`)

            return {
                success: true,
                async: true,
                requestId: taskId,
                externalId: `VIDU:VIDEO:${taskId}`,
            }
        } catch (error: unknown) {
            _ulogError(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
