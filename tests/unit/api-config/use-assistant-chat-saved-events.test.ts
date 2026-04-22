import type { UIMessage } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAssistantMessagesSignature,
  collectSavedEvents,
  readAssistantStoredMessages,
  writeAssistantStoredMessages,
} from '@/components/assistant/useAssistantChat'

describe('assistant chat saved events parser', () => {
  let storage = new Map<string, string>()

  beforeEach(() => {
    storage = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        },
        clear: () => {
          storage.clear()
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('persists and restores assistant messages from localStorage', () => {
    const storageKey = 'assistant:test'
    const messages = [{
      id: 'm3',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'hello' },
      ],
    }] as unknown as UIMessage[]

    writeAssistantStoredMessages(storageKey, messages)

    expect(readAssistantStoredMessages(storageKey)).toEqual(messages)
  })

  it('returns empty messages when localStorage payload is invalid', () => {
    storage.set('assistant:broken', '{broken-json')

    expect(readAssistantStoredMessages('assistant:broken')).toEqual([])
  })

  it('builds the same signature for message arrays with identical content', () => {
    const firstMessages = [{
      id: 'm4',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'hello' },
      ],
    }] as unknown as UIMessage[]
    const secondMessages = [{
      id: 'm4',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'hello' },
      ],
    }] as unknown as UIMessage[]

    expect(firstMessages).not.toBe(secondMessages)
    expect(buildAssistantMessagesSignature(firstMessages)).toBe(
      buildAssistantMessagesSignature(secondMessages),
    )
  })
})
