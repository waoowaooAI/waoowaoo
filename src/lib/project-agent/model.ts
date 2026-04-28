import type { LanguageModel } from 'ai'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { getProviderKey } from '@/lib/ai-registry/selection'
import { resolveLlmRuntimeModel } from '@/lib/ai-exec/llm-runtime'
import { createAiLanguageModel } from '@/lib/ai-exec/language-model'

export async function resolveProjectAgentLanguageModel(input: {
  userId: string
  analysisModelKey: string
}): Promise<{
  languageModel: LanguageModel
}> {
  const selection = await resolveLlmRuntimeModel(input.userId, input.analysisModelKey)
  const providerConfig = await getProviderConfig(input.userId, selection.provider)
  const providerKey = getProviderKey(selection.provider)
  return {
    languageModel: createAiLanguageModel({
      providerKey,
      selection,
      providerConfig,
    }),
  }
}
