import { describe, expect, it } from 'vitest'

import {
  composeModelKey,
  getProviderKey,
  parseModelKey,
  parseModelKeyStrict,
  resolveSelection,
} from '@/lib/ai-registry/selection'

describe('ai-registry/selection', () => {
  it('extracts providerKey from providerId', () => {
    expect(getProviderKey(undefined)).toBe('')
    expect(getProviderKey('')).toBe('')
    expect(getProviderKey('google')).toBe('google')
    expect(getProviderKey('gemini-compatible:uuid-1')).toBe('gemini-compatible')
  })

  it('parses modelKey strictly and composes modelKey', () => {
    expect(composeModelKey('google', 'gemini-3.1')).toBe('google::gemini-3.1')
    expect(parseModelKeyStrict('google::gemini-3.1')).toEqual({
      provider: 'google',
      modelId: 'gemini-3.1',
      modelKey: 'google::gemini-3.1',
    })
    expect(parseModelKey('google::gemini-3.1')).toEqual(parseModelKeyStrict('google::gemini-3.1'))
  })

  it('resolves selection with providerKey derived from provider', () => {
    expect(resolveSelection('gemini-compatible:uuid-1::gemini-3.1')).toEqual({
      provider: 'gemini-compatible:uuid-1',
      modelId: 'gemini-3.1',
      modelKey: 'gemini-compatible:uuid-1::gemini-3.1',
      providerKey: 'gemini-compatible',
    })
  })
})

