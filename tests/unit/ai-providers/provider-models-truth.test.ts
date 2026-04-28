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
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'
import { OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/openrouter/models'
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
  options: Record<string, unknown>,
  context = 'provider-models-truth',
) {
  expect(() => validateAiOptions({ schema, options, context })).not.toThrow()
}

describe('provider models truth', () => {
  it('wires representative capability catalog entries from provider models', () => {
    expect(ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'doubao-seedance-2-0-260128')?.capabilities?.video?.resolutionOptions).toEqual(['480p', '720p'])
    expect(BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'wan2.7-i2v')?.capabilities?.video?.generationModeOptions).toEqual(['normal', 'firstlastframe'])
    expect(FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'banana-2')?.capabilities?.image?.resolutionOptions).toEqual(['1K', '2K', '4K'])
    expect(GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'gemini-3.1-flash-image-preview')?.capabilities?.image?.resolutionOptions).toEqual(['0.5K', '1K', '2K', '4K'])
    expect(MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'minimax-hailuo-02')?.capabilities?.video?.firstlastframe).toBe(true)
    expect(VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES.find((entry) => entry.modelId === 'viduq2-pro')?.capabilities?.video?.generateAudioOptions).toEqual([false, true])
  })

  it('wires representative pricing catalog entries from provider models', () => {
    expect(ARK_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'doubao-seedream-4-5-251128')?.pricing.flatAmount).toBe(0.25)
    expect(BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'qwen-voice-design')?.pricing.flatAmount).toBe(0.2)
    expect(FAL_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'fal-ai/kling-video/lipsync/audio-to-video')?.pricing.flatAmount).toBe(0.5)
    expect(GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'veo-3.1-fast-generate-preview')?.pricing.tiers?.[0]?.amount).toBe(4.32)
    expect(GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'gemini-3.1-flash-lite-preview')?.pricing.tiers?.[1]?.amount).toBe(10.8)
    expect(MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 't2v-01-director')?.pricing.tiers?.[0]?.amount).toBe(6)
    expect(OPENROUTER_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'google/gemini-3.1-pro-preview')?.pricing.tiers?.[1]?.amount).toBe(72)
    expect(VIDU_BUILTIN_PRICING_CATALOG_ENTRIES.find((entry) => entry.modelId === 'vidu-lipsync')?.pricing.flatAmount).toBe(0.5)
  })

  it('keeps every built-in Google LLM capability entry billable', () => {
    const pricedTextModelIds = new Set(
      GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES
        .filter((entry) => entry.apiType === 'text')
        .map((entry) => entry.modelId),
    )
    const googleLlmCapabilityModelIds = GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES
      .filter((entry) => entry.modelType === 'llm')
      .map((entry) => entry.modelId)

    expect(googleLlmCapabilityModelIds).toEqual(expect.arrayContaining(['gemini-3.1-flash-lite-preview']))
    expect(googleLlmCapabilityModelIds.filter((modelId) => !pricedTextModelIds.has(modelId))).toEqual([])
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
