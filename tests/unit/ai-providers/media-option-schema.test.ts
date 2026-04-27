import { describe, expect, it, vi } from 'vitest'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { arkMediaAdapter } from '@/lib/ai-providers/ark/adapter'
import { falMediaAdapter } from '@/lib/ai-providers/fal/adapter'
import { minimaxMediaAdapter } from '@/lib/ai-providers/minimax/adapter'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'

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

function validateDescriptorOptions(input: {
  schema: ReturnType<typeof arkMediaAdapter.describeVariant>['optionSchema']
  options: Record<string, unknown> | undefined
  context?: string
}) {
  validateAiOptions({
    schema: input.schema,
    options: input.options,
    context: input.context || 'unit',
  })
}

describe('media adapter option schema', () => {
  it('rejects Ark image requests before generator when aspect ratio or size is missing', () => {
    const descriptor = arkMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { resolution: '4K' },
      context: 'image:ark::doubao-seedream-4-5-251128',
    })).toThrow('AI_OPTION_REQUIRED:image:ark::doubao-seedream-4-5-251128:aspectRatio_or_size')
  })

  it('rejects provider-specific invalid Ark image values from descriptor schema', () => {
    const descriptor = arkMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { aspectRatio: '5:4', resolution: '2K' },
    })).toThrow('AI_OPTION_INVALID:unit:aspectRatio:unsupported_value=5:4')
  })

  it('rejects provider-specific invalid Fal image resolution from descriptor schema', () => {
    const descriptor = falMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'fal',
      modelId: 'banana',
      modelKey: 'fal::banana',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { aspectRatio: '16:9', resolution: '8K' },
    })).toThrow('AI_OPTION_INVALID:unit:resolution:unsupported_value=8K')
  })

  it('allows same OpenAI compatible image size and resolution but rejects conflicts', () => {
    const descriptor = openAiCompatibleMediaAdapter.describeVariant('image', mediaSelection({
      provider: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:oa-1::gpt-image-1',
      compatMode: 'sync',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { size: '1024x1024', resolution: '1024x1024', outputFormat: 'png' },
    })).not.toThrow()
    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { size: '1024x1024', resolution: '1536x1024' },
    })).toThrow('AI_OPTION_CONFLICT:unit:size_and_resolution_must_match')
  })

  it('rejects Ark video duration outside model descriptor bounds', () => {
    const descriptor = arkMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedance-2-0-260128',
      modelKey: 'ark::doubao-seedance-2-0-260128',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { duration: 3, resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:duration:min=4')
  })
})

describe('media adapter video option schema', () => {
  it('rejects MiniMax invalid duration/resolution combinations before generator', () => {
    const descriptor = minimaxMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'minimax',
      modelId: 'minimax-hailuo-2.3',
      modelKey: 'minimax::minimax-hailuo-2.3',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { duration: 10, resolution: '1080P' },
    })).toThrow('AI_OPTION_INVALID:unit:duration=10_for_resolution=1080P_in_minimax-hailuo-2.3')
  })

  it('rejects MiniMax first-last-frame mode for models that do not support it', () => {
    const descriptor = minimaxMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'minimax',
      modelId: 'minimax-hailuo-2.3',
      modelKey: 'minimax::minimax-hailuo-2.3',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { generationMode: 'firstlastframe', lastFrameImageUrl: 'https://example.com/last.png' },
    })).toThrow('AI_OPTION_INVALID:unit:generationMode=firstlastframe_for_minimax-hailuo-2.3')
  })

  it('rejects Vidu invalid duration/resolution combinations from descriptor schema', () => {
    const descriptor = viduMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'vidu',
      modelId: 'vidu2.0',
      modelKey: 'vidu::vidu2.0',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { duration: 8, resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:resolution=1080p')
  })

  it('rejects Vidu audioType unless audio generation is explicitly enabled', () => {
    const descriptor = viduMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'vidu',
      modelId: 'viduq2-turbo',
      modelKey: 'vidu::viduq2-turbo',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { audioType: 'all' },
    })).toThrow('AI_OPTION_INVALID:unit:audioType_requires_generateAudio')
  })

  it('rejects OpenAI-compatible video size and resolution conflicts from descriptor schema', () => {
    const descriptor = openAiCompatibleMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'openai-compatible:oa-1',
      modelId: 'sora-2',
      modelKey: 'openai-compatible:oa-1::sora-2',
      compatMode: 'async',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { size: '720p', resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:size_and_resolution_must_match')
  })

  it('rejects unknown Fal video models from descriptor schema', () => {
    const descriptor = falMediaAdapter.describeVariant('video', mediaSelection({
      provider: 'fal',
      modelId: 'unknown-fal-video',
      modelKey: 'fal::unknown-fal-video',
    }))

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: {},
    })).toThrow('AI_OPTION_INVALID:unit:modelId=unknown-fal-video')
  })
})
