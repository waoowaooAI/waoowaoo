import type {
  VideoTokenEstimateResult,
  VideoTokenPricingContract,
  VideoTokenPricingMetadata,
  VideoTokenPricingSelections,
} from '@/lib/ai-providers/shared/video-token-pricing'
import type { CapabilityValue } from '@/lib/ai-registry/types'
import { ARK_TOKEN_PRICED_VIDEO_MODEL_IDS } from './models'

type Seedance2Resolution = '480p' | '720p'
type Seedance2AspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'

const SEEDANCE_2_OUTPUT_DIMENSIONS: {
  [resolution in Seedance2Resolution]: {
    [aspectRatio in Seedance2AspectRatio]: { width: number; height: number }
  }
} = {
  '480p': {
    '16:9': { width: 864, height: 496 },
    '4:3': { width: 752, height: 560 },
    '1:1': { width: 640, height: 640 },
    '3:4': { width: 560, height: 752 },
    '9:16': { width: 496, height: 864 },
    '21:9': { width: 992, height: 432 },
  },
  '720p': {
    '16:9': { width: 1280, height: 720 },
    '4:3': { width: 1112, height: 834 },
    '1:1': { width: 960, height: 960 },
    '3:4': { width: 834, height: 1112 },
    '9:16': { width: 720, height: 1280 },
    '21:9': { width: 1470, height: 630 },
  },
}

const SEEDANCE_2_VIDEO_INPUT_MIN_TOKEN_FLOOR: {
  [durationSeconds: number]: { [resolution in Seedance2Resolution]: number }
} = {
  4: { '480p': 70308, '720p': 151200 },
  5: { '480p': 90396, '720p': 194400 },
  6: { '480p': 100440, '720p': 216000 },
  7: { '480p': 120528, '720p': 259200 },
  8: { '480p': 140616, '720p': 302400 },
  9: { '480p': 150660, '720p': 324000 },
  10: { '480p': 170748, '720p': 367200 },
  11: { '480p': 190836, '720p': 410400 },
  12: { '480p': 200880, '720p': 432000 },
  13: { '480p': 220968, '720p': 475200 },
  14: { '480p': 241056, '720p': 518400 },
  15: { '480p': 251100, '720p': 540000 },
}

const SEEDANCE_2_DEFAULT_OUTPUT_DURATION_SECONDS = 5
const SEEDANCE_2_MIN_INPUT_VIDEO_SECONDS = 2
const SEEDANCE_2_DEFAULT_ASPECT_RATIO: Seedance2AspectRatio = '16:9'
const SEEDANCE_2_FPS = 24

function parseModelId(model: string): string {
  const marker = model.indexOf('::')
  return marker === -1 ? model : model.slice(marker + 2)
}

function invalid(field: string, value: CapabilityValue | undefined, code: 'unsupported-resolution' | 'unsupported-capability'): VideoTokenEstimateResult {
  return {
    status: 'invalid',
    failure: { code, field, value },
  }
}

function resolveSeedance2Resolution(value: CapabilityValue | undefined): Seedance2Resolution | VideoTokenEstimateResult {
  if (value === '480p' || value === '720p') return value
  return invalid('resolution', value, 'unsupported-resolution')
}

function resolveSeedance2AspectRatio(value: CapabilityValue | undefined): Seedance2AspectRatio | VideoTokenEstimateResult {
  if (
    value === '16:9'
    || value === '4:3'
    || value === '1:1'
    || value === '3:4'
    || value === '9:16'
    || value === '21:9'
  ) {
    return value
  }
  if (value === undefined) return SEEDANCE_2_DEFAULT_ASPECT_RATIO
  return invalid('aspectRatio', value, 'unsupported-capability')
}

function readMetadataNumber(metadata: VideoTokenPricingMetadata | undefined, field: string): number | null {
  if (!metadata) return null
  const value = metadata[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isInvalidResult(value: Seedance2Resolution | Seedance2AspectRatio | VideoTokenEstimateResult): value is VideoTokenEstimateResult {
  return typeof value === 'object'
}

export const arkSeedance2VideoTokenPricingContract: VideoTokenPricingContract = {
  providerKey: 'ark',
  supportsModel(model) {
    const modelId = parseModelId(model)
    return ARK_TOKEN_PRICED_VIDEO_MODEL_IDS.some((candidate) => candidate === modelId)
  },
  applyDefaultSelections(selections) {
    if (typeof selections.containsVideoInput !== 'boolean') {
      selections.containsVideoInput = false
    }
  },
  estimateTokens(selections: VideoTokenPricingSelections, metadata?: VideoTokenPricingMetadata): VideoTokenEstimateResult {
    const resolution = resolveSeedance2Resolution(selections.resolution)
    if (isInvalidResult(resolution)) return resolution
    const aspectRatio = resolveSeedance2AspectRatio(selections.aspectRatio)
    if (isInvalidResult(aspectRatio)) return aspectRatio

    const outputDurationSeconds = typeof selections.duration === 'number'
      ? selections.duration
      : SEEDANCE_2_DEFAULT_OUTPUT_DURATION_SECONDS
    const containsVideoInput = selections.containsVideoInput === true
    const inputVideoSeconds = containsVideoInput
      ? (readMetadataNumber(metadata, 'inputVideoSeconds') ?? SEEDANCE_2_MIN_INPUT_VIDEO_SECONDS)
      : 0
    const outputSize = SEEDANCE_2_OUTPUT_DIMENSIONS[resolution][aspectRatio]
    const estimatedTokens = Math.ceil(
      ((inputVideoSeconds + outputDurationSeconds) * outputSize.width * outputSize.height * SEEDANCE_2_FPS) / 1024,
    )

    if (!containsVideoInput || aspectRatio !== '16:9') {
      return { status: 'ok', tokens: estimatedTokens }
    }

    const durationFloor = SEEDANCE_2_VIDEO_INPUT_MIN_TOKEN_FLOOR[outputDurationSeconds]?.[resolution]
    return {
      status: 'ok',
      tokens: typeof durationFloor === 'number'
        ? Math.max(estimatedTokens, durationFloor)
        : estimatedTokens,
    }
  },
  resolveContainsVideoInput(metadata) {
    return metadata?.containsVideoInput === true
  },
}
