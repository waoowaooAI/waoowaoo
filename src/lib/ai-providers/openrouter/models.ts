import type { AiOptionSchema } from '@/lib/ai-registry/types'
import { buildMediaOptionSchema, type MediaModality } from '@/lib/ai-providers/shared/option-schema'

export const OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES = [
  {
    apiType: 'text',
    provider: 'openrouter',
    modelId: 'google/gemini-3.1-pro-preview',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { tokenType: 'input' }, amount: 9 },
        { when: { tokenType: 'output' }, amount: 72 },
      ],
    },
  },
  {
    apiType: 'text',
    provider: 'openrouter',
    modelId: 'google/gemini-3-pro-preview',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { tokenType: 'input' }, amount: 9 },
        { when: { tokenType: 'output' }, amount: 72 },
      ],
    },
  },
  {
    apiType: 'text',
    provider: 'openrouter',
    modelId: 'google/gemini-3-flash-preview',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { tokenType: 'input' }, amount: 0.54 },
        { when: { tokenType: 'output' }, amount: 2.16 },
      ],
    },
  },
  {
    apiType: 'text',
    provider: 'openrouter',
    modelId: 'anthropic/claude-sonnet-4.5',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { tokenType: 'input' }, amount: 21.6 },
        { when: { tokenType: 'output' }, amount: 108 },
      ],
    },
  },
  {
    apiType: 'text',
    provider: 'openrouter',
    modelId: 'anthropic/claude-sonnet-4',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { tokenType: 'input' }, amount: 21.6 },
        { when: { tokenType: 'output' }, amount: 108 },
      ],
    },
  },
] as const

export const OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  { modelType: 'llm', provider: 'openrouter', modelId: 'google/gemini-3.1-pro-preview', capabilities: { llm: { reasoningEffortOptions: ['low', 'medium', 'high'] } } },
  { modelType: 'llm', provider: 'openrouter', modelId: 'google/gemini-3-pro-preview', capabilities: { llm: { reasoningEffortOptions: ['low', 'medium', 'high'] } } },
  { modelType: 'llm', provider: 'openrouter', modelId: 'google/gemini-3-flash-preview', capabilities: { llm: { reasoningEffortOptions: ['minimal', 'low', 'medium', 'high'] } } },
  { modelType: 'llm', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4.5', capabilities: { llm: { reasoningEffortOptions: ['low', 'medium', 'high'] } } },
  { modelType: 'llm', provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4', capabilities: { llm: { reasoningEffortOptions: ['low', 'medium', 'high'] } } },
] as const

export const OPENROUTER_API_CONFIG_CATALOG_MODELS = [
  { modelId: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', type: 'llm', provider: 'openrouter' },
  { modelId: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', type: 'llm', provider: 'openrouter' },
  { modelId: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', type: 'llm', provider: 'openrouter' },
  { modelId: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', type: 'llm', provider: 'openrouter' },
  { modelId: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', type: 'llm', provider: 'openrouter' },
  { modelId: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', type: 'llm', provider: 'openrouter' },
  { modelId: 'openai/gpt-5.4', name: 'GPT-5.4', type: 'llm', provider: 'openrouter' },
] as const

export function resolveOpenRouterOptionSchema(modality: MediaModality): AiOptionSchema {
  return buildMediaOptionSchema(modality)
}
