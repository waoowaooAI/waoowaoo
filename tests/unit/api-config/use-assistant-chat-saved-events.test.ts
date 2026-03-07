import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { collectSavedEvents } from '@/components/assistant/useAssistantChat'

describe('assistant chat saved events parser', () => {
  it('parses single save tool output event', () => {
    const messages = [{
      id: 'm1',
      role: 'assistant',
      parts: [{
        type: 'tool-saveModelTemplate',
        state: 'output-available',
        output: {
          status: 'saved',
          savedModelKey: 'openai-compatible:oa-1::veo3-fast',
          draftModel: {
            modelId: 'veo3-fast',
            name: 'Veo 3 Fast',
            type: 'video',
            provider: 'openai-compatible:oa-1',
            compatMediaTemplate: {
              version: 1,
              mediaType: 'video',
              mode: 'async',
              create: { method: 'POST', path: '/video/create' },
              status: { method: 'GET', path: '/video/query?id={{task_id}}' },
              response: { taskIdPath: '$.id', statusPath: '$.status' },
              polling: { intervalMs: 5000, timeoutMs: 600000, doneStates: ['completed'], failStates: ['failed'] },
            },
          },
        },
      }],
    }] as unknown as UIMessage[]

    const events = collectSavedEvents(messages)

    expect(events).toHaveLength(1)
    expect(events[0]?.savedModelKey).toBe('openai-compatible:oa-1::veo3-fast')
    expect(events[0]?.draftModel?.modelId).toBe('veo3-fast')
  })

  it('parses batch save tool output events', () => {
    const messages = [{
      id: 'm2',
      role: 'assistant',
      parts: [{
        type: 'tool-saveModelTemplates',
        state: 'output-available',
        output: {
          status: 'saved',
          savedModelKeys: [
            'openai-compatible:oa-1::veo3-fast',
            'openai-compatible:oa-1::veo3.1-fast',
          ],
          draftModels: [
            {
              modelId: 'veo3-fast',
              name: 'Veo 3 Fast',
              type: 'video',
              provider: 'openai-compatible:oa-1',
              compatMediaTemplate: {
                version: 1,
                mediaType: 'video',
                mode: 'async',
                create: { method: 'POST', path: '/video/create' },
                status: { method: 'GET', path: '/video/query?id={{task_id}}' },
                response: { taskIdPath: '$.id', statusPath: '$.status' },
                polling: { intervalMs: 5000, timeoutMs: 600000, doneStates: ['completed'], failStates: ['failed'] },
              },
            },
            {
              modelId: 'veo3.1-fast',
              name: 'Veo 3.1 Fast',
              type: 'video',
              provider: 'openai-compatible:oa-1',
              compatMediaTemplate: {
                version: 1,
                mediaType: 'video',
                mode: 'async',
                create: { method: 'POST', path: '/video/create' },
                status: { method: 'GET', path: '/video/query?id={{task_id}}' },
                response: { taskIdPath: '$.id', statusPath: '$.status' },
                polling: { intervalMs: 5000, timeoutMs: 600000, doneStates: ['completed'], failStates: ['failed'] },
              },
            },
          ],
        },
      }],
    }] as unknown as UIMessage[]

    const events = collectSavedEvents(messages)

    expect(events).toHaveLength(2)
    expect(events.map((item) => item.savedModelKey)).toEqual([
      'openai-compatible:oa-1::veo3-fast',
      'openai-compatible:oa-1::veo3.1-fast',
    ])
    expect(events[1]?.draftModel?.name).toBe('Veo 3.1 Fast')
  })
})
