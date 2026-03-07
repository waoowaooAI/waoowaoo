import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<{ customProviders: string; customModels: string } | null>>(async () => null),
    upsert: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { saveModelTemplateConfiguration } from '@/lib/user-api/model-template/save'

function readSavedModelsFromUpsert(): Array<Record<string, unknown>> {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) throw new Error('expected upsert to be called')
  const payload = (firstCall as [{ update?: { customModels?: unknown } }])[0]
  const raw = payload.update?.customModels
  if (typeof raw !== 'string') throw new Error('expected customModels string')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('expected customModels array')
  return parsed as Array<Record<string, unknown>>
}

describe('user-api model template save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves existing model fields while updating target model template', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([
        { id: 'openai-compatible:oa-1', name: 'OpenAI Compat' },
      ]),
      customModels: JSON.stringify([
        {
          modelId: 'veo3.1',
          modelKey: 'openai-compatible:oa-1::veo3.1',
          name: 'Veo 3.1',
          type: 'video',
          provider: 'openai-compatible:oa-1',
          customPricing: { video: { basePrice: 1.2 } },
          capabilities: { video: { durationOptions: [5, 8] } },
        },
      ]),
    })

    await saveModelTemplateConfiguration({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'veo3.1',
      name: 'Veo 3.1',
      type: 'video',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: { method: 'POST', path: '/v2/videos/generations' },
        status: { method: 'GET', path: '/v2/videos/generations/{{task_id}}' },
        response: {
          taskIdPath: '$.task_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 3000,
          timeoutMs: 180000,
          doneStates: ['done'],
          failStates: ['failed'],
        },
      },
      source: 'ai',
    })

    const savedModels = readSavedModelsFromUpsert()
    const target = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo3.1')
    expect(target).toBeTruthy()
    expect(target?.customPricing).toEqual({ video: { basePrice: 1.2 } })
    expect(target?.capabilities).toEqual({ video: { durationOptions: [5, 8] } })
    expect(target?.compatMediaTemplate).toMatchObject({
      mediaType: 'video',
      mode: 'async',
    })
    expect(target?.compatMediaTemplateSource).toBe('ai')
    expect(typeof target?.compatMediaTemplateCheckedAt).toBe('string')
  })
})
