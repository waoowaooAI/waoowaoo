export const MINIMAX_VIDEO_MODES = ['normal', 'firstlastframe'] as const

export type ResolutionDurationRule = { resolution: string; durations: readonly number[] }

export const MINIMAX_VIDEO_SPECS: Record<string, {
  supportsFirstLastFrame: boolean
  normalRules: readonly ResolutionDurationRule[]
  firstLastFrameRules?: readonly ResolutionDurationRule[]
}> = {
  'minimax-hailuo-2.3': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
  },
  'minimax-hailuo-2.3-fast': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
  },
  'minimax-hailuo-02': {
    supportsFirstLastFrame: true,
    normalRules: [{ resolution: '512P', durations: [6, 10] }, { resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
    firstLastFrameRules: [{ resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
  },
  't2v-01': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '720P', durations: [6] }],
  },
  't2v-01-director': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '720P', durations: [6] }],
  },
}
