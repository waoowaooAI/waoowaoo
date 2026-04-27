import { describe, expect, it, vi } from 'vitest'

import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { arkMediaAdapter } from '@/lib/ai-providers/ark/adapter'
import { bailianMediaAdapter } from '@/lib/ai-providers/bailian/adapter'
import { falMediaAdapter } from '@/lib/ai-providers/fal/adapter'
import { googleMediaAdapter } from '@/lib/ai-providers/google/adapter'
import { minimaxMediaAdapter } from '@/lib/ai-providers/minimax/adapter'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'
import { findBuiltinCapabilityCatalogEntry } from '@/lib/model-capabilities/catalog'
import { findBuiltinPricingCatalogEntry } from '@/lib/model-pricing/catalog'

vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({})),
}))

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
  options: Record<string, unknown>,
  context = 'provider-models-truth',
) {
  expect(() => validateAiOptions({ schema, options, context })).not.toThrow()
}

describe('provider models truth', () => {
  it('wires representative capability catalog entries from provider models', () => {
    expect(findBuiltinCapabilityCatalogEntry('video', 'ark', 'doubao-seedance-2-0-260128')?.capabilities?.video?.resolutionOptions).toEqual(['480p', '720p'])
    expect(findBuiltinCapabilityCatalogEntry('video', 'bailian', 'wan2.7-i2v')?.capabilities?.video?.generationModeOptions).toEqual(['normal', 'firstlastframe'])
    expect(findBuiltinCapabilityCatalogEntry('image', 'fal', 'banana-2')?.capabilities?.image?.resolutionOptions).toEqual(['1K', '2K', '4K'])
    expect(findBuiltinCapabilityCatalogEntry('image', 'google', 'gemini-3.1-flash-image-preview')?.capabilities?.image?.resolutionOptions).toEqual(['0.5K', '1K', '2K', '4K'])
    expect(findBuiltinCapabilityCatalogEntry('video', 'minimax', 'minimax-hailuo-02')?.capabilities?.video?.firstlastframe).toBe(true)
    expect(findBuiltinCapabilityCatalogEntry('video', 'vidu', 'viduq2-pro')?.capabilities?.video?.generateAudioOptions).toEqual([false, true])
  })

  it('wires representative pricing catalog entries from provider models', () => {
    expect(findBuiltinPricingCatalogEntry('image', 'ark', 'doubao-seedream-4-5-251128')?.pricing.flatAmount).toBe(0.25)
    expect(findBuiltinPricingCatalogEntry('voice-design', 'bailian', 'qwen-voice-design')?.pricing.flatAmount).toBe(0.2)
    expect(findBuiltinPricingCatalogEntry('lip-sync', 'fal', 'fal-ai/kling-video/lipsync/audio-to-video')?.pricing.flatAmount).toBe(0.5)
    expect(findBuiltinPricingCatalogEntry('video', 'google', 'veo-3.1-fast-generate-preview')?.pricing.tiers?.[0]?.amount).toBe(4.32)
    expect(findBuiltinPricingCatalogEntry('video', 'minimax', 't2v-01-director')?.pricing.tiers?.[0]?.amount).toBe(6)
    expect(findBuiltinPricingCatalogEntry('text', 'openrouter', 'google/gemini-3.1-pro-preview')?.pricing.tiers?.[1]?.amount).toBe(72)
    expect(findBuiltinPricingCatalogEntry('lip-sync', 'vidu', 'vidu-lipsync')?.pricing.flatAmount).toBe(0.5)
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
  })
})
