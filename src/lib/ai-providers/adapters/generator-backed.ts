import type { DescribeOnlyMediaAdapter } from './types'
import { describeMediaVariantBase } from './shared'

function createGeneratorBackedAdapter(
  providerKey: 'fal' | 'minimax' | 'vidu',
  videoMode: 'async' | 'batch',
): DescribeOnlyMediaAdapter {
  return {
    providerKey,
    describeVariant(modality, selection) {
      return describeMediaVariantBase({
        modality,
        selection,
        executionMode: modality === 'video' ? videoMode : 'sync',
      })
    },
  }
}

export const falMediaAdapter = createGeneratorBackedAdapter('fal', 'async')
export const minimaxMediaAdapter = createGeneratorBackedAdapter('minimax', 'async')
export const viduMediaAdapter = createGeneratorBackedAdapter('vidu', 'async')
