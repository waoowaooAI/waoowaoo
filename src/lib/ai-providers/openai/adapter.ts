import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeOpenAiImageGeneration } from './image'
import { createOpenAiLanguageModel } from './language-model'
import { resolveOpenAiOptionSchema } from './models'

export const openAiAdapter: AiProviderAdapter = {
  providerKey: 'openai',
  image: {
    describe: (selection) => describeMediaVariantBase({
      modality: 'image',
      selection,
      executionMode: 'sync',
      optionSchema: resolveOpenAiOptionSchema('image'),
    }),
    execute: executeOpenAiImageGeneration,
  },
  languageModel: {
    create: createOpenAiLanguageModel,
  },
}
