import { describe, expect, it } from 'vitest'
import { isAiCompatibleProvider, resolveAiGatewayRoute } from '@/lib/ai-registry/gateway-route'

describe('ai-registry gateway route', () => {
  it('routes openai-compatible providers to openai-compat', () => {
    expect(isAiCompatibleProvider('openai-compatible')).toBe(true)
    expect(isAiCompatibleProvider('openai-compatible:oa-1')).toBe(true)
    expect(resolveAiGatewayRoute('openai-compatible:oa-1')).toBe('openai-compat')
  })

  it('keeps gemini-compatible providers on official route', () => {
    expect(isAiCompatibleProvider('gemini-compatible')).toBe(false)
    expect(isAiCompatibleProvider('gemini-compatible:gm-1')).toBe(false)
    expect(resolveAiGatewayRoute('gemini-compatible:gm-1')).toBe('official')
  })

  it('keeps official providers on official route', () => {
    expect(isAiCompatibleProvider('google')).toBe(false)
    expect(isAiCompatibleProvider('ark')).toBe(false)
    expect(isAiCompatibleProvider('bailian')).toBe(false)
    expect(isAiCompatibleProvider('siliconflow')).toBe(false)
    expect(resolveAiGatewayRoute('google')).toBe('official')
    expect(resolveAiGatewayRoute('ark')).toBe('official')
    expect(resolveAiGatewayRoute('bailian')).toBe('official')
    expect(resolveAiGatewayRoute('siliconflow')).toBe('official')
  })
})
