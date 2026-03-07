import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVoiceDesign } from '@/lib/providers/bailian/voice-design'

describe('bailian voice design', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses qwen3-tts-vd-2026-01-26 as target model', async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => ({
      ok: true,
      json: async () => ({
        output: {
          voice: 'voice_1',
          target_model: 'qwen3-tts-vd-2026-01-26',
          preview_audio: {
            data: 'base64',
            sample_rate: 24000,
            response_format: 'wav',
          },
        },
        usage: { count: 1 },
        request_id: 'req-1',
      }),
      text: async () => '',
      status: 200,
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: '',
      bodyUsed: false,
      clone: () => undefined as unknown as Response,
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await createVoiceDesign({
      voicePrompt: '成熟稳重男声',
      previewText: '你好测试',
    }, 'bl-key')

    const firstCall = fetchMock.mock.calls[0] as [unknown, RequestInit?] | undefined
    const requestBodyRaw = firstCall?.[1]?.body
    expect(typeof requestBodyRaw).toBe('string')
    const requestBody = JSON.parse(requestBodyRaw as string) as {
      input?: { target_model?: string }
    }
    expect(requestBody.input?.target_model).toBe('qwen3-tts-vd-2026-01-26')
  })
})
