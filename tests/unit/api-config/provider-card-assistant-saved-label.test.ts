import { describe, expect, it } from 'vitest'
import { getAssistantSavedModelLabel } from '@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState'

describe('provider card assistant saved label', () => {
  it('prefers draft model name when available', () => {
    const label = getAssistantSavedModelLabel({
      savedModelKey: 'openai-compatible:oa-1::veo_3_1-fast-4K',
      draftModel: {
        modelId: 'veo_3_1-fast-4K',
        name: 'Veo 3.1 Fast 4K',
        type: 'video',
        provider: 'openai-compatible:oa-1',
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: {
            method: 'POST',
            path: '/v1/video/create',
          },
          status: {
            method: 'GET',
            path: '/v1/video/query?id={{task_id}}',
          },
          response: {
            taskIdPath: '$.id',
            statusPath: '$.status',
          },
          polling: {
            intervalMs: 5000,
            timeoutMs: 600000,
            doneStates: ['completed'],
            failStates: ['failed'],
          },
        },
      },
    })

    expect(label).toBe('Veo 3.1 Fast 4K')
  })

  it('falls back to model id parsed from savedModelKey', () => {
    const label = getAssistantSavedModelLabel({
      savedModelKey: 'openai-compatible:oa-1::veo_3_1-fast-4K',
    })

    expect(label).toBe('veo_3_1-fast-4K')
  })
})
