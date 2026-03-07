import { describe, expect, it } from 'vitest'
import {
  migrateGatewayRoutePayload,
  migrateProviderEntry,
} from '@/lib/migrations/gateway-route-openai-compat'

describe('gateway-route openai-compat migration', () => {
  it('migrates openai-compatible litellm route to openai-compat', () => {
    const result = migrateProviderEntry({
      id: 'openai-compatible:oa-1',
      gatewayRoute: 'litellm',
    })

    expect(result.changed).toBe(true)
    expect(result.next).toMatchObject({
      id: 'openai-compatible:oa-1',
      gatewayRoute: 'openai-compat',
    })
    expect(result.summary.routeLitellmToOpenaiCompat).toBe(1)
  })

  it('forces gemini-compatible to gemini-sdk + official route', () => {
    const result = migrateProviderEntry({
      id: 'gemini-compatible:gm-1',
      apiMode: 'openai-official',
      gatewayRoute: 'openai-compat',
    })

    expect(result.changed).toBe(true)
    expect(result.next).toMatchObject({
      id: 'gemini-compatible:gm-1',
      apiMode: 'gemini-sdk',
      gatewayRoute: 'official',
    })
    expect(result.summary.geminiApiModeCorrected).toBe(1)
    expect(result.summary.routeForcedOfficial).toBe(1)
  })

  it('forces non-openai-compatible compat routes to official', () => {
    const result = migrateProviderEntry({
      id: 'openrouter',
      gatewayRoute: 'openai-compat',
    })

    expect(result.changed).toBe(true)
    expect(result.next).toMatchObject({
      id: 'openrouter',
      gatewayRoute: 'official',
    })
    expect(result.summary.routeForcedOfficial).toBe(1)
  })

  it('returns invalid status for malformed payload json', () => {
    const result = migrateGatewayRoutePayload('{bad-json')
    expect(result.status).toBe('invalid')
    expect(result.summary.invalidPayload).toBe(true)
  })

  it('migrates mixed provider payload and reports aggregate stats', () => {
    const result = migrateGatewayRoutePayload(JSON.stringify([
      {
        id: 'openai-compatible:oa-1',
        gatewayRoute: 'litellm',
      },
      {
        id: 'gemini-compatible:gm-1',
        apiMode: 'openai-official',
        gatewayRoute: 'openai-compat',
      },
      {
        id: 'google',
        gatewayRoute: 'official',
      },
    ]))

    expect(result.status).toBe('ok')
    expect(result.changed).toBe(true)
    expect(result.summary.providersScanned).toBe(3)
    expect(result.summary.providersChanged).toBe(2)
    expect(result.summary.routeLitellmToOpenaiCompat).toBe(1)
    expect(result.summary.routeForcedOfficial).toBe(1)
    expect(result.summary.geminiApiModeCorrected).toBe(1)

    const nextPayload = JSON.parse(result.nextRaw || '[]') as Array<Record<string, unknown>>
    expect(nextPayload[0]?.gatewayRoute).toBe('openai-compat')
    expect(nextPayload[1]?.apiMode).toBe('gemini-sdk')
    expect(nextPayload[1]?.gatewayRoute).toBe('official')
  })
})
