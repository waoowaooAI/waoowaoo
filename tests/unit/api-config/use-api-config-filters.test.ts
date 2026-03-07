import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  }
})

import { useApiConfigFilters } from '@/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters'
import type { CustomModel, Provider } from '@/app/[locale]/profile/components/api-config/types'

describe('api config filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges audio providers into modelProviders and removes audioProviders output', () => {
    const providers: Provider[] = [
      { id: 'fal', name: 'FAL', hasApiKey: true, apiKey: 'k-fal' },
      { id: 'bailian', name: 'Alibaba Bailian', hasApiKey: true, apiKey: 'k-bl' },
    ]
    const models: CustomModel[] = [
      {
        modelId: 'fal-ai/index-tts-2/text-to-speech',
        modelKey: 'fal::fal-ai/index-tts-2/text-to-speech',
        name: 'IndexTTS 2',
        type: 'audio',
        provider: 'fal',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'qwen3-tts-vd-2026-01-26',
        modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
        name: 'Qwen3 TTS',
        type: 'audio',
        provider: 'bailian',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'qwen-voice-design',
        modelKey: 'bailian::qwen-voice-design',
        name: 'Qwen Voice Design',
        type: 'audio',
        provider: 'bailian',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'qwen3.5-flash',
        modelKey: 'bailian::qwen3.5-flash',
        name: 'Qwen 3.5 Flash',
        type: 'llm',
        provider: 'bailian',
        price: 0,
        enabled: true,
      },
    ]

    const result = useApiConfigFilters({ providers, models })
    const providerIds = result.modelProviders.map((provider) => provider.id)
    const audioDefaultIds = result.getEnabledModelsByType('audio').map((model) => model.modelId)

    expect(providerIds).toEqual(['fal', 'bailian'])
    expect(audioDefaultIds).toEqual(expect.arrayContaining([
      'fal-ai/index-tts-2/text-to-speech',
      'qwen3-tts-vd-2026-01-26',
    ]))
    expect(audioDefaultIds).not.toContain('qwen-voice-design')
    expect(Object.prototype.hasOwnProperty.call(result, 'audioProviders')).toBe(false)
  })

  it('keeps modelProviders order aligned with providers input order', () => {
    const providers: Provider[] = [
      { id: 'google', name: 'Google AI Studio', hasApiKey: true, apiKey: 'k-google' },
      { id: 'openai-compatible:oa-2', name: 'OpenAI B', hasApiKey: true, apiKey: 'k-oa2' },
      { id: 'ark', name: 'Volcengine Ark', hasApiKey: true, apiKey: 'k-ark' },
    ]
    const models: CustomModel[] = [
      {
        modelId: 'gemini-3.1-pro-preview',
        modelKey: 'google::gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        type: 'llm',
        provider: 'google',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'gpt-4.1',
        modelKey: 'openai-compatible:oa-2::gpt-4.1',
        name: 'GPT 4.1',
        type: 'llm',
        provider: 'openai-compatible:oa-2',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'doubao-seed-2-0-pro-260215',
        modelKey: 'ark::doubao-seed-2-0-pro-260215',
        name: 'Doubao Seed 2.0 Pro',
        type: 'llm',
        provider: 'ark',
        price: 0,
        enabled: true,
      },
    ]

    const result = useApiConfigFilters({ providers, models })
    expect(result.modelProviders.map((provider) => provider.id)).toEqual([
      'google',
      'openai-compatible:oa-2',
      'ark',
    ])
  })
})
