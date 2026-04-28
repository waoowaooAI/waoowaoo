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
