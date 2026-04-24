import { describe, expect, it, vi } from 'vitest'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { arkMediaAdapter } from '@/lib/ai-providers/adapters/ark'
import { falMediaAdapter, minimaxMediaAdapter, viduMediaAdapter } from '@/lib/ai-providers/adapters/generator-backed'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/adapters/openai-compatible'

vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({})),
}))

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
    const descriptor = arkMediaAdapter.describeVariant('image', {
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { resolution: '4K' },
      context: 'image:ark::doubao-seedream-4-5-251128',
    })).toThrow('AI_OPTION_REQUIRED:image:ark::doubao-seedream-4-5-251128:aspectRatio_or_size')
  })

  it('rejects provider-specific invalid Ark image values from descriptor schema', () => {
    const descriptor = arkMediaAdapter.describeVariant('image', {
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { aspectRatio: '5:4', resolution: '2K' },
    })).toThrow('AI_OPTION_INVALID:unit:aspectRatio:unsupported_value=5:4')
  })

  it('rejects provider-specific invalid Fal image resolution from descriptor schema', () => {
    const descriptor = falMediaAdapter.describeVariant('image', {
      provider: 'fal',
      modelId: 'banana',
      modelKey: 'fal::banana',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { aspectRatio: '16:9', resolution: '8K' },
    })).toThrow('AI_OPTION_INVALID:unit:resolution:unsupported_value=8K')
  })

  it('allows same OpenAI compatible image size and resolution but rejects conflicts', () => {
    const descriptor = openAiCompatibleMediaAdapter.describeVariant('image', {
      provider: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:oa-1::gpt-image-1',
      compatMediaTemplate: { mode: 'sync' },
    })

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
    const descriptor = arkMediaAdapter.describeVariant('video', {
      provider: 'ark',
      modelId: 'doubao-seedance-2-0-260128',
      modelKey: 'ark::doubao-seedance-2-0-260128',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { duration: 3, resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:duration:min=4')
  })
})

describe('media adapter video option schema', () => {
  it('rejects MiniMax invalid duration/resolution combinations before generator', () => {
    const descriptor = minimaxMediaAdapter.describeVariant('video', {
      provider: 'minimax',
      modelId: 'minimax-hailuo-2.3',
      modelKey: 'minimax::minimax-hailuo-2.3',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { duration: 10, resolution: '1080P' },
    })).toThrow('AI_OPTION_INVALID:unit:duration=10_for_resolution=1080P_in_minimax-hailuo-2.3')
  })

  it('rejects MiniMax first-last-frame mode for models that do not support it', () => {
    const descriptor = minimaxMediaAdapter.describeVariant('video', {
      provider: 'minimax',
      modelId: 'minimax-hailuo-2.3',
      modelKey: 'minimax::minimax-hailuo-2.3',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { generationMode: 'firstlastframe', lastFrameImageUrl: 'https://example.com/last.png' },
    })).toThrow('AI_OPTION_INVALID:unit:generationMode=firstlastframe_for_minimax-hailuo-2.3')
  })

  it('rejects Vidu invalid duration/resolution combinations from descriptor schema', () => {
    const descriptor = viduMediaAdapter.describeVariant('video', {
      provider: 'vidu',
      modelId: 'vidu2.0',
      modelKey: 'vidu::vidu2.0',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { duration: 8, resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:resolution=1080p')
  })

  it('rejects Vidu audioType unless audio generation is explicitly enabled', () => {
    const descriptor = viduMediaAdapter.describeVariant('video', {
      provider: 'vidu',
      modelId: 'viduq2-turbo',
      modelKey: 'vidu::viduq2-turbo',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { audioType: 'all' },
    })).toThrow('AI_OPTION_INVALID:unit:audioType_requires_generateAudio')
  })

  it('rejects OpenAI-compatible video size and resolution conflicts from descriptor schema', () => {
    const descriptor = openAiCompatibleMediaAdapter.describeVariant('video', {
      provider: 'openai-compatible:oa-1',
      modelId: 'sora-2',
      modelKey: 'openai-compatible:oa-1::sora-2',
      compatMediaTemplate: { mode: 'async' },
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: { size: '720p', resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:size_and_resolution_must_match')
  })

  it('rejects unknown Fal video models from descriptor schema', () => {
    const descriptor = falMediaAdapter.describeVariant('video', {
      provider: 'fal',
      modelId: 'unknown-fal-video',
      modelKey: 'fal::unknown-fal-video',
    })

    expect(() => validateDescriptorOptions({
      schema: descriptor.optionSchema,
      options: {},
    })).toThrow('AI_OPTION_INVALID:unit:modelId=unknown-fal-video')
  })
})
