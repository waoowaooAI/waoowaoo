import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { resolveMinimaxOptionSchema } from './models'
import { executeMinimaxVideoGeneration } from './video'

export const minimaxAdapter: AiProviderAdapter = {
  providerKey: 'minimax',
  video: {
    describe: (selection) => describeMediaVariantBase({
      modality: 'video',
      selection,
      executionMode: 'async',
      optionSchema: resolveMinimaxOptionSchema('video', selection.modelId),
    }),
    execute: executeMinimaxVideoGeneration,
  },
}
