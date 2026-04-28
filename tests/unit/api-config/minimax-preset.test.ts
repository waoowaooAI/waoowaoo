import { describe, expect, it } from 'vitest'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { API_CONFIG_CATALOG_PROVIDERS, listApiConfigCatalogModels } from '@/lib/ai-registry/api-config-catalog'

ensureAiCatalogsRegistered()

describe('api-config minimax preset', () => {
  it('uses official minimax baseUrl in preset provider', () => {
    const minimaxProvider = API_CONFIG_CATALOG_PROVIDERS.find((provider) => provider.id === 'minimax')
    expect(minimaxProvider).toBeDefined()
    expect(minimaxProvider?.baseUrl).toBe('https://api.minimaxi.com/v1')
  })

  it('includes all required minimax official llm preset models', () => {
    const minimaxLlmModelIds = listApiConfigCatalogModels()
      .filter((model) => model.provider === 'minimax' && model.type === 'llm')
      .map((model) => model.modelId)

    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2')
  })
})
