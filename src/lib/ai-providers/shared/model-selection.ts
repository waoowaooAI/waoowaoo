import type { AiResolvedSelection } from '@/lib/ai-registry/types'

export function requireSelectedModelId(selection: AiResolvedSelection, context: string): string {
  const modelId = selection.modelId.trim()
  if (!modelId) {
    throw new Error(`AI_MODEL_ID_REQUIRED:${context}:${selection.modelKey || selection.provider}`)
  }
  return modelId
}
