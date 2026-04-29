import type { CapabilityValue } from '@/lib/ai-registry/types'

export type VideoTokenPricingMetadata = { [field: string]: unknown }
export type VideoTokenPricingSelections = { [field: string]: CapabilityValue }

export type VideoTokenPricingFailure = {
  code: 'unsupported-resolution' | 'unsupported-capability'
  field: string
  value: CapabilityValue | undefined
}

export type VideoTokenEstimateResult =
  | {
    status: 'ok'
    tokens: number
  }
  | {
    status: 'invalid'
    failure: VideoTokenPricingFailure
  }

export interface VideoTokenPricingContract {
  readonly providerKey: string
  supportsModel: (model: string) => boolean
  applyDefaultSelections: (selections: VideoTokenPricingSelections) => void
  estimateTokens: (
    selections: VideoTokenPricingSelections,
    metadata?: VideoTokenPricingMetadata,
  ) => VideoTokenEstimateResult
  resolveContainsVideoInput: (metadata?: VideoTokenPricingMetadata) => boolean
}
