import { describe, expect, it } from 'vitest'

import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { arkMediaAdapter } from '@/lib/ai-providers/ark/adapter'
import { ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES, ARK_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/ark/models'
import { bailianMediaAdapter } from '@/lib/ai-providers/bailian/adapter'
import { BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES, BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/bailian/models'
import { falMediaAdapter } from '@/lib/ai-providers/fal/adapter'
import { FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES, FAL_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/fal/models'
import { googleMediaAdapter } from '@/lib/ai-providers/google/adapter'
import { GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES, GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/google/models'
import { minimaxMediaAdapter } from '@/lib/ai-providers/minimax/adapter'
import { MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES, MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/minimax/models'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES, OPENAI_COMPATIBLE_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/openai-compatible/models'
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'
import { openRouterMediaAdapter } from '@/lib/ai-providers/openrouter/adapter'
import { OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES, OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/openrouter/models'
import { siliconFlowMediaAdapter } from '@/lib/ai-providers/siliconflow/adapter'
import { SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES, SILICONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/siliconflow/models'
import { VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES, VIDU_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/vidu/models'

function mediaSelection(input: {
  provider: string
  modelId: string
  modelKey: string
  compatMode?: 'sync' | 'async'
}) {
  return {
    provider: input.provider,
    modelId: input.modelId,
    modelKey: input.modelKey,
    variantSubKind: input.compatMode ? 'user-template' as const : 'official' as const,
    ...(input.compatMode
      ? { variantData: { compatMediaTemplate: { mode: input.compatMode } } }
      : {}),
  }
}

function expectValidOptions(
  schema: Parameters<typeof validateAiOptions>[0]['schema'],
  options: unknown,
  context = 'provider-models-truth',
) {
  expect(() => validateAiOptions({ schema, options, context })).not.toThrow()
}

describe('provider models truth', () => {
  it('ensures capability/pricing catalog entries are well-formed', () => {
    const capabilityEntries = [
      ...ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
      ...VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
    ]

    const modelTypes = new Set(['llm', 'image', 'video', 'audio', 'lipsync'])

    for (const entry of capabilityEntries) {
      expect(modelTypes.has(entry.modelType)).toBe(true)
      expect(typeof entry.provider).toBe('string')
      expect(entry.provider.trim().length).toBeGreaterThan(0)
      expect(typeof entry.modelId).toBe('string')
      expect(entry.modelId.trim().length).toBeGreaterThan(0)

      if (entry.capabilities === undefined) continue
      expect(typeof entry.capabilities).toBe('object')
      expect(Array.isArray(entry.capabilities)).toBe(false)
    }

    const pricingEntries = [
      ...ARK_BUILTIN_PRICING_CATALOG_ENTRIES,
      ...BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES,
      ...FAL_BUILTIN_PRICING_CATALOG_ENTRIES,
      ...GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES,
      ...MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES,
      ...OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES,
      ...VIDU_BUILTIN_PRICING_CATALOG_ENTRIES,
    ]

    const apiTypes = new Set(['text', 'image', 'video', 'voice', 'voice-design', 'lip-sync'])

    for (const entry of pricingEntries) {
      expect(apiTypes.has(entry.apiType)).toBe(true)
      expect(typeof entry.provider).toBe('string')
      expect(entry.provider.trim().length).toBeGreaterThan(0)
      expect(typeof entry.modelId).toBe('string')
      expect(entry.modelId.trim().length).toBeGreaterThan(0)

      expect(entry.pricing).toBeTruthy()
      expect(typeof entry.pricing).toBe('object')
      expect(Array.isArray(entry.pricing)).toBe(false)

      if (entry.pricing.mode === 'flat') {
        expect(typeof entry.pricing.flatAmount).toBe('number')
        expect(Number.isFinite(entry.pricing.flatAmount)).toBe(true)
        expect(entry.pricing.flatAmount).toBeGreaterThanOrEqual(0)
        continue
      }

      expect(entry.pricing.mode).toBe('capability')
      expect(Array.isArray(entry.pricing.tiers)).toBe(true)
      expect(entry.pricing.tiers.length).toBeGreaterThan(0)
      for (const tier of entry.pricing.tiers) {
        expect(tier.when).toBeTruthy()
        expect(typeof tier.when).toBe('object')
        expect(Array.isArray(tier.when)).toBe(false)
        expect(Object.keys(tier.when).length).toBeGreaterThan(0)
        expect(typeof tier.amount).toBe('number')
        expect(Number.isFinite(tier.amount)).toBe(true)
        expect(tier.amount).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('wires representative capability catalog entries from provider models', () => {
    expect(ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'doubao-seedance-2-0-260128')?.capabilities?.video?.resolutionOptions).toEqual(['480p', '720p'])
    expect(BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'wan2.7-i2v')?.capabilities?.video?.generationModeOptions).toEqual(['normal', 'firstlastframe'])
    expect(FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'banana-2')?.capabilities?.image?.resolutionOptions).toEqual(['1K', '2K', '4K'])
    expect(GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'gemini-3.1-flash-image-preview')?.capabilities?.image?.resolutionOptions).toEqual(['0.5K', '1K', '2K', '4K'])
    expect(MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'minimax-hailuo-02')?.capabilities?.video?.firstlastframe).toBe(true)
    expect(OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'gpt-image-1')?.capabilities?.image?.resolutionOptions).toContain('1024x1024')
    expect(OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'google/gemini-3.1-pro-preview')?.capabilities?.llm?.reasoningEffortOptions).toEqual(['low', 'medium', 'high'])
    expect(SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES).toHaveLength(0)
    expect(VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'viduq2-pro')?.capabilities?.video?.generateAudioOptions).toEqual([false, true])
  })

  it('wires representative pricing catalog entries from provider models', () => {
    expect(ARK_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'doubao-seedream-4-5-251128')?.pricing.flatAmount).toBe(0.25)
    expect(BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'qwen-voice-design')?.pricing.flatAmount).toBe(0.2)
    expect(FAL_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'fal-ai/kling-video/lipsync/audio-to-video')?.pricing.flatAmount).toBe(0.5)
    expect(GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'veo-3.1-fast-generate-preview')?.pricing.tiers?.[0]?.amount).toBe(4.32)
    expect(MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 't2v-01-director')?.pricing.tiers?.[0]?.amount).toBe(6)
    expect(OPENAI_COMPATIBLE_BUILTIN_PRICING_CATALOG_ENTRIES).toHaveLength(0)
    expect(OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'google/gemini-3.1-pro-preview')?.pricing.tiers?.[1]?.amount).toBe(72)
    expect(SILICONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES).toHaveLength(0)
    expect(VIDU_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'vidu-lipsync')?.pricing.flatAmount).toBe(0.5)
  })

  it('builds option schemas from provider models data', () => {
    const arkImage = arkMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    }))
    expect(() => validateAiOptions({
      schema: arkImage.optionSchema,
      options: { resolution: '4K' },
      context: 'ark-image',
    })).toThrow('AI_OPTION_REQUIRED:ark-image:aspectRatio_or_size')

    const bailianVideo = bailianMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'bailian',
      modelId: 'wan2.7-i2v',
      modelKey: 'bailian::wan2.7-i2v',
    }))
    expect(() => validateAiOptions({
      schema: bailianVideo.optionSchema,
      options: { promptExtend: 'yes' },
      context: 'bailian-video',
    })).toThrow('AI_OPTION_INVALID:bailian-video:promptExtend:expected_boolean')

    const falImage = falMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'fal',
      modelId: 'banana-2',
      modelKey: 'fal::banana-2',
    }))
    expect(() => validateAiOptions({
      schema: falImage.optionSchema,
      options: { resolution: '8K' },
      context: 'fal-image',
    })).toThrow('AI_OPTION_INVALID:fal-image:resolution:unsupported_value=8K')

    const googleImage = googleMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'google',
      modelId: 'gemini-3.1-flash-image-preview',
      modelKey: 'google::gemini-3.1-flash-image-preview',
    }))
    expectValidOptions(googleImage.optionSchema, { resolution: '2K' }, 'google-image')

    const minimaxVideo = minimaxMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'minimax',
      modelId: 'minimax-hailuo-02',
      modelKey: 'minimax::minimax-hailuo-02',
    }))
    expect(() => validateAiOptions({
      schema: minimaxVideo.optionSchema,
      options: { generationMode: 'firstlastframe', resolution: '512P', duration: 6, lastFrameImageUrl: 'https://example.com/frame.png' },
      context: 'minimax-video',
    })).toThrow('AI_OPTION_INVALID:minimax-video:resolution=512P_for_minimax-hailuo-02')

    const viduVideo = viduMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'vidu',
      modelId: 'viduq2-turbo',
      modelKey: 'vidu::viduq2-turbo',
    }))
    expect(() => validateAiOptions({
      schema: viduVideo.optionSchema,
      options: { audioType: 'all' },
      context: 'vidu-video',
    })).toThrow('AI_OPTION_INVALID:vidu-video:audioType_requires_generateAudio')

    const openAiImage = openAiCompatibleMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:oa-1::gpt-image-1',
      compatMode: 'sync',
    }))
    expect(() => validateAiOptions({
      schema: openAiImage.optionSchema,
      options: { size: '1024x1024', resolution: '1536x1024' },
      context: 'openai-image',
    })).toThrow('AI_OPTION_CONFLICT:openai-image:size_and_resolution_must_match')

    const openRouterImage = openRouterMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'openrouter',
      modelId: 'google/gemini-3.1-pro-preview',
      modelKey: 'openrouter::google/gemini-3.1-pro-preview',
    }))
    expect(() => validateAiOptions({
      schema: openRouterImage.optionSchema,
      options: { unsupportedField: true },
      context: 'openrouter-image',
    })).toThrow('AI_OPTION_UNSUPPORTED:openrouter-image:unsupportedField')

    const siliconFlowImage = siliconFlowMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'siliconflow',
      modelId: 'any',
      modelKey: 'siliconflow::any',
    }))
    expect(() => validateAiOptions({
      schema: siliconFlowImage.optionSchema,
      options: { unsupportedField: true },
      context: 'siliconflow-image',
    })).toThrow('AI_OPTION_UNSUPPORTED:siliconflow-image:unsupportedField')
  })
})
