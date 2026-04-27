export const VIDU_VIDEO_MODES = ['normal', 'firstlastframe'] as const
export const VIDU_STANDARD_RATIOS = new Set(['16:9', '9:16', '1:1'])
export const VIDU_Q2_EXTRA_RATIOS = new Set(['4:3', '3:4', '21:9', '2:3', '3:2', 'auto'])
export const VIDU_AUDIO_TYPES = new Set(['all', 'speech_only', 'sound_effect_only'])
export const VIDU_MOVEMENT_AMPLITUDES = new Set(['auto', 'small', 'medium', 'large'])
export const VIDU_RATIO_PATTERN = /^(\d{1,4}):(\d{1,4})$/
export const VIDU_MAX_PAYLOAD_LENGTH = 1048576

function range(start: number, end: number): readonly number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export type ViduModeSpec = {
  durationOptions: readonly number[]
  resolutionByDuration: Readonly<Record<number, readonly string[]>>
}

export type ViduSpec = {
  aspectRatioProfile: 'standard' | 'q2-flex'
  supportsFirstLastFrame: boolean
  supportsGenerateAudio: boolean
  normal: ViduModeSpec
  firstLast?: ViduModeSpec
}

function uniformViduSpec(durations: readonly number[], resolutions: readonly string[]): ViduModeSpec {
  return {
    durationOptions: durations,
    resolutionByDuration: Object.fromEntries(durations.map((duration) => [duration, resolutions])),
  }
}

const Q3_DURATIONS = range(1, 16)
const Q2_NORMAL_DURATIONS = range(1, 10)
const Q2_FIRSTLAST_DURATIONS = range(1, 8)
const VIDU_20_MODE: ViduModeSpec = {
  durationOptions: [4, 8],
  resolutionByDuration: { 4: ['360p', '720p', '1080p'], 8: ['720p'] },
}

export const VIDU_VIDEO_SPECS: Record<string, ViduSpec> = {
  'viduq3-pro': {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q3_DURATIONS, ['540p', '720p', '1080p']),
    firstLast: uniformViduSpec(Q3_DURATIONS, ['540p', '720p', '1080p']),
  },
  'viduq2-pro-fast': {
    aspectRatioProfile: 'q2-flex', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q2_NORMAL_DURATIONS, ['720p', '1080p']),
    firstLast: uniformViduSpec(Q2_FIRSTLAST_DURATIONS, ['720p', '1080p']),
  },
  'viduq2-pro': {
    aspectRatioProfile: 'q2-flex', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q2_NORMAL_DURATIONS, ['540p', '720p', '1080p']),
    firstLast: uniformViduSpec(Q2_FIRSTLAST_DURATIONS, ['540p', '720p', '1080p']),
  },
  'viduq2-turbo': {
    aspectRatioProfile: 'q2-flex', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q2_NORMAL_DURATIONS, ['540p', '720p', '1080p']),
    firstLast: uniformViduSpec(Q2_FIRSTLAST_DURATIONS, ['540p', '720p', '1080p']),
  },
  viduq1: {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: false,
    normal: uniformViduSpec([5], ['1080p']), firstLast: uniformViduSpec([5], ['1080p']),
  },
  'viduq1-classic': {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: false,
    normal: uniformViduSpec([5], ['1080p']), firstLast: uniformViduSpec([5], ['1080p']),
  },
  'vidu2.0': {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: false,
    normal: VIDU_20_MODE, firstLast: VIDU_20_MODE,
  },
}
