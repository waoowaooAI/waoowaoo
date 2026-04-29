import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeFalImageGeneration } from './image'
import { submitFalLipSync } from './lipsync'
import { resolveFalOptionSchema } from './models'
import { executeFalVideoGeneration } from './video'
import {
  createFalVoiceLineMissingBindingError,
  executeFalVoiceLineGeneration,
  resolveFalVoiceLineBinding,
} from './voice-line'

function describeFalMediaVariant(
  modality: 'image' | 'video',
  selection: Parameters<NonNullable<AiProviderAdapter['image']>['describe']>[0],
) {
  return describeMediaVariantBase({
    modality,
    selection,
    executionMode: modality === 'video' ? 'async' : 'sync',
    optionSchema: resolveFalOptionSchema(modality, selection.modelId),
  })
}

export const falAdapter: AiProviderAdapter = {
  providerKey: 'fal',
  image: {
    describe: (selection) => describeFalMediaVariant('image', selection),
    execute: executeFalImageGeneration,
  },
  video: {
    describe: (selection) => describeFalMediaVariant('video', selection),
    execute: executeFalVideoGeneration,
  },
  lipsync: {
    execute: (input) => submitFalLipSync(input.params, {
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    }),
  },
  voiceLine: {
    resolveBinding: resolveFalVoiceLineBinding,
    createMissingBindingError: createFalVoiceLineMissingBindingError,
    execute: executeFalVoiceLineGeneration,
  },
}
