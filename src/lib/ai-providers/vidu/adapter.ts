import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { submitViduLipSync } from './lipsync'
import { resolveViduOptionSchema } from './models'
import { executeViduVideoGeneration } from './video'

export const viduAdapter: AiProviderAdapter = {
  providerKey: 'vidu',
  video: {
    describe: (selection) => describeMediaVariantBase({
      modality: 'video',
      selection,
      executionMode: 'async',
      optionSchema: resolveViduOptionSchema('video', selection.modelId),
    }),
    execute: executeViduVideoGeneration,
  },
  lipsync: {
    execute: (input) => submitViduLipSync(input.params, {
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    }),
  },
}
