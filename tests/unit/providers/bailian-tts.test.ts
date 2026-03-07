import { beforeEach, describe, expect, it, vi } from 'vitest'
import { synthesizeWithBailianTTS } from '@/lib/providers/bailian/tts'

function buildWavBuffer(durationMs: number): Buffer {
  const sampleRate = 8000
  const channels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const dataLength = Math.round((durationMs / 1000) * byteRate)
  const pcmData = Buffer.alloc(dataLength, 0)
  const output = Buffer.alloc(44 + dataLength)

  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(36 + dataLength, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(channels, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(byteRate, 28)
  output.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  output.writeUInt16LE(bitsPerSample, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(dataLength, 40)
  pcmData.copy(output, 44)

  return output
}

describe('bailian tts synthesis', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('synthesizes one segment and returns wav buffer', async () => {
    const wav = buildWavBuffer(120)
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes('/multimodal-generation/generation')) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            output: {
              audio: {
                url: 'https://audio.example/segment-1.wav',
              },
            },
            usage: { characters: 10 },
            request_id: 'req-1',
          }),
        }
      }
      if (input === 'https://audio.example/segment-1.wav') {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength),
        }
      }
      throw new Error(`unexpected fetch url: ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await synthesizeWithBailianTTS({
      text: '你好，世界',
      voiceId: 'voice_1',
    }, 'bl-key')

    expect(result.success).toBe(true)
    expect(result.audioData).toBeDefined()
    expect(result.audioDuration).toBe(120)
    expect(result.audioUrl).toBe('https://audio.example/segment-1.wav')
    expect(result.characters).toBe(10)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('splits text over 600 chars and merges audio segments', async () => {
    const wavA = buildWavBuffer(100)
    const wavB = buildWavBuffer(200)
    let generationCallCount = 0
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes('/multimodal-generation/generation')) {
        generationCallCount += 1
        const audioUrl = generationCallCount === 1
          ? 'https://audio.example/segment-a.wav'
          : 'https://audio.example/segment-b.wav'
        return {
          ok: true,
          text: async () => JSON.stringify({
            output: {
              audio: { url: audioUrl },
            },
            usage: { characters: 600 },
            request_id: `req-${generationCallCount}`,
          }),
        }
      }
      if (input === 'https://audio.example/segment-a.wav') {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => wavA.buffer.slice(wavA.byteOffset, wavA.byteOffset + wavA.byteLength),
        }
      }
      if (input === 'https://audio.example/segment-b.wav') {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => wavB.buffer.slice(wavB.byteOffset, wavB.byteOffset + wavB.byteLength),
        }
      }
      throw new Error(`unexpected fetch url: ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await synthesizeWithBailianTTS({
      text: 'a'.repeat(601),
      voiceId: 'voice_2',
    }, 'bl-key')

    expect(result.success).toBe(true)
    expect(result.audioData).toBeDefined()
    expect(result.audioDuration).toBe(300)
    expect(result.audioUrl).toBeUndefined()
    expect(result.characters).toBe(1200)
    expect(generationCallCount).toBe(2)
  })

  it('fails explicitly when voiceId is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await synthesizeWithBailianTTS({
      text: 'hello',
      voiceId: '',
    }, 'bl-key')

    expect(result).toEqual({
      success: false,
      error: 'BAILIAN_TTS_VOICE_ID_REQUIRED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

