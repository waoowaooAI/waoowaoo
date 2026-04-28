import { describe, expect, it } from 'vitest'
import {
  normalizeProviderRuntimeBaseUrl,
  resolveRuntimeModelSelection,
  resolveSingleRuntimeModelSelection,
  type RuntimeStoredModel,
} from '@/lib/ai-registry/runtime-selection'

const models: RuntimeStoredModel[] = [
  {
    modelId: 'gpt-like',
    modelKey: 'openai-compatible:node-1::gpt-like',
    name: 'GPT Like',
    type: 'llm',
    provider: 'openai-compatible:node-1',
    llmProtocol: 'responses',
    price: 0,
  },
  {
    modelId: 'image-like',
    modelKey: 'openai-compatible:node-1::image-like',
    name: 'Image Like',
    type: 'image',
    provider: 'openai-compatible:node-1',
    compatMediaTemplate: { mode: 'sync' },
    price: 0,
  },
]

describe('runtime selection registry helpers', () => {
  it('builds openai-compatible llm selection without defaulting missing protocol', () => {
    const selection = resolveRuntimeModelSelection(models, 'openai-compatible:node-1::gpt-like', 'llm')

    expect(selection).toMatchObject({
      provider: 'openai-compatible:node-1',
      modelId: 'gpt-like',
      modelKey: 'openai-compatible:node-1::gpt-like',
      mediaType: 'llm',
      variantSubKind: 'official',
      variantData: { llmProtocol: 'responses' },
    })
  })

  it('keeps openai-compatible media template in provider-owned variant data', () => {
    const selection = resolveSingleRuntimeModelSelection(
      models.filter((model) => model.type === 'image'),
      'image',
    )

    expect(selection.variantSubKind).toBe('user-template')
    expect(selection.variantData).toEqual({ compatMediaTemplate: { mode: 'sync' } })
  })

  it('normalizes provider baseUrl outside user-api runtime-config', () => {
    expect(normalizeProviderRuntimeBaseUrl('minimax', undefined)).toBe('https://api.minimaxi.com/v1')
    expect(normalizeProviderRuntimeBaseUrl('openai-compatible:node-1', 'https://compat.example.com')).toBe('https://compat.example.com/v1')
  })
})
