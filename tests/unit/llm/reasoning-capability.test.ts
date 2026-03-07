import { describe, expect, it } from 'vitest'
import {
  isLikelyOpenAIReasoningModel,
  shouldUseOpenAIReasoningProviderOptions,
} from '@/lib/llm/reasoning-capability'

describe('llm/reasoning-capability', () => {
  it('identifies likely OpenAI reasoning model ids', () => {
    expect(isLikelyOpenAIReasoningModel('o3-mini')).toBe(true)
    expect(isLikelyOpenAIReasoningModel('gpt-5.2')).toBe(true)
    expect(isLikelyOpenAIReasoningModel('claude-sonnet-4-6')).toBe(false)
  })

  it('enables reasoning provider options for native openai provider', () => {
    expect(shouldUseOpenAIReasoningProviderOptions({
      providerKey: 'openai',
      modelId: 'gpt-5.2',
    })).toBe(true)
  })

  it('enables reasoning provider options for openai-compatible only when apiMode is openai-official', () => {
    expect(shouldUseOpenAIReasoningProviderOptions({
      providerKey: 'openai-compatible',
      providerApiMode: 'openai-official',
      modelId: 'gpt-5.2',
    })).toBe(true)

    expect(shouldUseOpenAIReasoningProviderOptions({
      providerKey: 'openai-compatible',
      modelId: 'gpt-5.2',
    })).toBe(false)
  })

  it('disables reasoning provider options for non-openai models even on openai-compatible gateways', () => {
    expect(shouldUseOpenAIReasoningProviderOptions({
      providerKey: 'openai-compatible',
      providerApiMode: 'openai-official',
      modelId: 'claude-sonnet-4-6',
    })).toBe(false)
  })
})
