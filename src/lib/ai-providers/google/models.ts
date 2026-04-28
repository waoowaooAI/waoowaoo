export const GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  { modelType: 'llm', provider: 'google', modelId: 'gemini-3.1-pro-preview', capabilities: { llm: { reasoningEffortOptions: ['low', 'medium', 'high'] } } },
  { modelType: 'llm', provider: 'google', modelId: 'gemini-3.1-flash-lite-preview', capabilities: { llm: { reasoningEffortOptions: ['minimal', 'low', 'medium', 'high'] } } },
  { modelType: 'llm', provider: 'google', modelId: 'gemini-3-flash-preview', capabilities: { llm: { reasoningEffortOptions: ['minimal', 'low', 'medium', 'high'] } } },
  { modelType: 'image', provider: 'google', modelId: 'gemini-3-pro-image-preview', capabilities: { image: { resolutionOptions: ['2K', '4K'] } } },
  { modelType: 'image', provider: 'google', modelId: 'gemini-3-pro-image-preview-batch', capabilities: { image: { resolutionOptions: ['2K', '4K'] } } },
  { modelType: 'image', provider: 'google', modelId: 'gemini-3.1-flash-image-preview', capabilities: { image: { resolutionOptions: ['0.5K', '1K', '2K', '4K'] } } },
  { modelType: 'image', provider: 'google', modelId: 'gemini-2.5-flash-image', capabilities: { image: { resolutionOptions: ['1K'] } } },
  { modelType: 'image', provider: 'google', modelId: 'imagen-4.0-generate-001', capabilities: { image: {} } },
  { modelType: 'image', provider: 'google', modelId: 'imagen-4.0-fast-generate-001', capabilities: { image: {} } },
  { modelType: 'image', provider: 'google', modelId: 'imagen-4.0-ultra-generate-001', capabilities: { image: {} } },
  {
    modelType: 'video',
    provider: 'google',
    modelId: 'veo-3.1-generate-preview',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        durationOptions: [4, 6, 8],
        resolutionOptions: ['720p', '1080p', '4k'],
        firstlastframe: true,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'google',
    modelId: 'veo-3.1-fast-generate-preview',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        durationOptions: [4, 6, 8],
        resolutionOptions: ['720p', '1080p', '4k'],
        firstlastframe: true,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'google',
    modelId: 'veo-3.0-generate-001',
    capabilities: { video: { durationOptions: [4, 6, 8], resolutionOptions: ['720p', '1080p', '4k'], supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'google',
    modelId: 'veo-3.0-fast-generate-001',
    capabilities: { video: { durationOptions: [4, 6, 8], resolutionOptions: ['720p', '1080p', '4k'], supportGenerateAudio: false } },
  },
  { modelType: 'video', provider: 'google', modelId: 'veo-2.0-generate-001', capabilities: { video: { durationOptions: [5, 6, 8], supportGenerateAudio: false } } },
] as const

function googleTokenPricing(input: number, output: number) {
  return {
    mode: 'capability' as const,
    tiers: [
      { when: { tokenType: 'input' }, amount: input },
      { when: { tokenType: 'output' }, amount: output },
    ],
  }
}

function googleFlatPricing(flatAmount: number) {
  return { mode: 'flat' as const, flatAmount }
}

export const GOOGLE_BUILTIN_PRICING_CATALOG_ENTRIES = [
  { apiType: 'text', provider: 'google', modelId: 'gemini-3.1-pro-preview', pricing: googleTokenPricing(14.4, 86.4) },
  { apiType: 'text', provider: 'google', modelId: 'gemini-3.1-flash-lite-preview', pricing: googleTokenPricing(1.8, 10.8) },
  { apiType: 'text', provider: 'google', modelId: 'gemini-3-pro-preview', pricing: googleTokenPricing(14.4, 86.4) },
  { apiType: 'text', provider: 'google', modelId: 'gemini-3-flash-preview', pricing: googleTokenPricing(3.6, 21.6) },
  {
    apiType: 'image',
    provider: 'google',
    modelId: 'gemini-3-pro-image-preview',
    pricing: { mode: 'capability', tiers: [{ when: { resolution: '2K' }, amount: 0.9648 }, { when: { resolution: '4K' }, amount: 1.728 }] },
  },
  {
    apiType: 'image',
    provider: 'google',
    modelId: 'gemini-3-pro-image-preview-batch',
    pricing: { mode: 'capability', tiers: [{ when: { resolution: '2K' }, amount: 0.4824 }, { when: { resolution: '4K' }, amount: 0.864 }] },
  },
  {
    apiType: 'image',
    provider: 'google',
    modelId: 'gemini-3.1-flash-image-preview',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { resolution: '0.5K' }, amount: 0.324 },
        { when: { resolution: '1K' }, amount: 0.4824 },
        { when: { resolution: '2K' }, amount: 0.7272 },
        { when: { resolution: '4K' }, amount: 1.0872 },
      ],
    },
  },
  { apiType: 'image', provider: 'google', modelId: 'gemini-2.5-flash-image', pricing: googleFlatPricing(0.2808) },
  { apiType: 'image', provider: 'google', modelId: 'imagen-4.0-generate-001', pricing: googleFlatPricing(0.288) },
  { apiType: 'image', provider: 'google', modelId: 'imagen-4.0-ultra-generate-001', pricing: googleFlatPricing(0.432) },
  { apiType: 'image', provider: 'google', modelId: 'imagen-4.0-fast-generate-001', pricing: googleFlatPricing(0.144) },
  {
    apiType: 'video',
    provider: 'google',
    modelId: 'veo-3.1-generate-preview',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { generationMode: 'normal', resolution: '720p', duration: 4 }, amount: 11.52 },
        { when: { generationMode: 'normal', resolution: '720p', duration: 6 }, amount: 17.28 },
        { when: { generationMode: 'normal', resolution: '720p', duration: 8 }, amount: 23.04 },
        { when: { generationMode: 'normal', resolution: '1080p', duration: 8 }, amount: 23.04 },
        { when: { generationMode: 'normal', resolution: '4k', duration: 8 }, amount: 34.56 },
        { when: { generationMode: 'firstlastframe', resolution: '720p', duration: 8 }, amount: 23.04 },
        { when: { generationMode: 'firstlastframe', resolution: '1080p', duration: 8 }, amount: 23.04 },
        { when: { generationMode: 'firstlastframe', resolution: '4k', duration: 8 }, amount: 34.56 },
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'google',
    modelId: 'veo-3.1-fast-generate-preview',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { generationMode: 'normal', resolution: '720p', duration: 4 }, amount: 4.32 },
        { when: { generationMode: 'normal', resolution: '720p', duration: 6 }, amount: 6.48 },
        { when: { generationMode: 'normal', resolution: '720p', duration: 8 }, amount: 8.64 },
        { when: { generationMode: 'normal', resolution: '1080p', duration: 8 }, amount: 8.64 },
        { when: { generationMode: 'normal', resolution: '4k', duration: 8 }, amount: 20.16 },
        { when: { generationMode: 'firstlastframe', resolution: '720p', duration: 8 }, amount: 8.64 },
        { when: { generationMode: 'firstlastframe', resolution: '1080p', duration: 8 }, amount: 8.64 },
        { when: { generationMode: 'firstlastframe', resolution: '4k', duration: 8 }, amount: 20.16 },
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'google',
    modelId: 'veo-3.0-generate-001',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { resolution: '720p', duration: 4 }, amount: 11.52 },
        { when: { resolution: '720p', duration: 6 }, amount: 17.28 },
        { when: { resolution: '720p', duration: 8 }, amount: 23.04 },
        { when: { resolution: '1080p', duration: 8 }, amount: 23.04 },
        { when: { resolution: '4k', duration: 8 }, amount: 23.04 },
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'google',
    modelId: 'veo-3.0-fast-generate-001',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { resolution: '720p', duration: 4 }, amount: 4.32 },
        { when: { resolution: '720p', duration: 6 }, amount: 6.48 },
        { when: { resolution: '720p', duration: 8 }, amount: 8.64 },
        { when: { resolution: '1080p', duration: 8 }, amount: 8.64 },
        { when: { resolution: '4k', duration: 8 }, amount: 8.64 },
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'google',
    modelId: 'veo-2.0-generate-001',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { duration: 5 }, amount: 12.6 },
        { when: { duration: 6 }, amount: 15.12 },
        { when: { duration: 8 }, amount: 20.16 },
      ],
    },
  },
] as const
