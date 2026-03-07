import { beforeEach, describe, expect, it, vi } from 'vitest'

const normalizeToOriginalMediaUrlMock = vi.hoisted(() => vi.fn(async (input: string) => input))
const uploadObjectMock = vi.hoisted(() => vi.fn(async () => 'voice/temp/lip-sync-preprocessed/test.wav'))
const getSignedUrlMock = vi.hoisted(() => vi.fn(() => '/api/storage/sign?key=voice%2Ftemp%2Flip-sync-preprocessed%2Ftest.wav'))
const toFetchableUrlMock = vi.hoisted(() => vi.fn((input: string) => {
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('data:')) return input
  if (input.startsWith('/')) return `https://public.example.com${input}`
  return input
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToOriginalMediaUrl: normalizeToOriginalMediaUrlMock,
}))

vi.mock('@/lib/storage', () => ({
  uploadObject: uploadObjectMock,
  getSignedUrl: getSignedUrlMock,
}))

vi.mock('@/lib/storage/utils', () => ({
  toFetchableUrl: toFetchableUrlMock,
}))

vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
}))

import {
  LIPSYNC_PREPROCESS_AUDIO_MIN_MS,
  preprocessLipSyncParams,
} from '@/lib/lipsync/preprocess'

function buildWav(durationMs: number, sampleRate = 16000): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const blockAlign = (numChannels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = Math.max(blockAlign, Math.round((durationMs / 1000) * byteRate))
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function buildMp4WithDuration(durationMs: number): Buffer {
  const timescale = 1000
  const duration = Math.max(1, Math.round(durationMs))
  const mvhdPayload = Buffer.alloc(4 + 4 + 4 + 4 + 4)
  mvhdPayload.writeUInt8(0, 0)
  mvhdPayload.writeUInt32BE(0, 4)
  mvhdPayload.writeUInt32BE(0, 8)
  mvhdPayload.writeUInt32BE(timescale, 12)
  mvhdPayload.writeUInt32BE(duration, 16)
  const mvhdSize = 8 + mvhdPayload.length
  const mvhd = Buffer.alloc(mvhdSize)
  mvhd.writeUInt32BE(mvhdSize, 0)
  mvhd.write('mvhd', 4, 'ascii')
  mvhdPayload.copy(mvhd, 8)

  const moovSize = 8 + mvhd.length
  const moov = Buffer.alloc(moovSize)
  moov.writeUInt32BE(moovSize, 0)
  moov.write('moov', 4, 'ascii')
  mvhd.copy(moov, 8)

  const ftyp = Buffer.alloc(24)
  ftyp.writeUInt32BE(24, 0)
  ftyp.write('ftyp', 4, 'ascii')
  ftyp.write('isom', 8, 'ascii')
  ftyp.writeUInt32BE(0x200, 12)
  ftyp.write('isom', 16, 'ascii')
  ftyp.write('mp41', 20, 'ascii')

  return Buffer.concat([ftyp, moov])
}

function readWavDurationMs(buffer: Buffer): number {
  const byteRate = buffer.readUInt32LE(28)
  const dataSize = buffer.readUInt32LE(40)
  return Math.round((dataSize / byteRate) * 1000)
}

function buildBinaryResponse(buffer: Buffer, contentType: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': contentType,
    }),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    text: async () => '',
  } as unknown as Response
}

describe('lipsync preprocess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pads short audio to minimum duration for fal', async () => {
    const shortAudio = buildWav(1000)
    const video = buildMp4WithDuration(5000)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('video.mp4')) return buildBinaryResponse(video, 'video/mp4')
      if (url.includes('audio.wav')) return buildBinaryResponse(shortAudio, 'audio/wav')
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await preprocessLipSyncParams(
      {
        videoUrl: 'https://assets.example.com/video.mp4',
        audioUrl: 'https://assets.example.com/audio.wav',
        audioDurationMs: 1000,
      },
      { providerKey: 'fal' },
    )

    expect(result.paddedAudio).toBe(true)
    expect(result.trimmedAudio).toBe(false)
    expect(result.params.audioUrl.startsWith('data:audio/wav;base64,')).toBe(true)
    const base64 = result.params.audioUrl.slice('data:audio/wav;base64,'.length)
    const paddedBuffer = Buffer.from(base64, 'base64')
    expect(readWavDurationMs(paddedBuffer)).toBeGreaterThanOrEqual(LIPSYNC_PREPROCESS_AUDIO_MIN_MS)
    expect(uploadObjectMock).not.toHaveBeenCalled()
  })

  it('trims audio to video duration for vidu and uploads processed audio', async () => {
    const longAudio = buildWav(7000)
    const video = buildMp4WithDuration(5000)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('video.mp4')) return buildBinaryResponse(video, 'video/mp4')
      if (url.includes('audio.wav')) return buildBinaryResponse(longAudio, 'audio/wav')
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await preprocessLipSyncParams(
      {
        videoUrl: 'https://assets.example.com/video.mp4',
        audioUrl: 'https://assets.example.com/audio.wav',
        audioDurationMs: 7000,
      },
      { providerKey: 'vidu' },
    )

    expect(result.paddedAudio).toBe(false)
    expect(result.trimmedAudio).toBe(true)
    expect(uploadObjectMock).toHaveBeenCalledTimes(1)
    const uploadCall = uploadObjectMock.mock.calls[0] as unknown as [Buffer] | undefined
    expect(uploadCall).toBeTruthy()
    if (!uploadCall) throw new Error('expected uploadObject call')
    const uploadedBuffer = uploadCall[0]
    expect(readWavDurationMs(uploadedBuffer)).toBeLessThanOrEqual(5000)
    expect(result.params.audioUrl).toBe('https://public.example.com/api/storage/sign?key=voice%2Ftemp%2Flip-sync-preprocessed%2Ftest.wav')
  })

  it('probes durations and keeps audio unchanged when no adjustment is needed', async () => {
    const audio = buildWav(3000)
    const video = buildMp4WithDuration(5000)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('video.mp4')) return buildBinaryResponse(video, 'video/mp4')
      if (url.includes('audio.wav')) return buildBinaryResponse(audio, 'audio/wav')
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await preprocessLipSyncParams(
      {
        videoUrl: 'https://assets.example.com/video.mp4',
        audioUrl: 'https://assets.example.com/audio.wav',
      },
      { providerKey: 'bailian' },
    )

    expect(result.paddedAudio).toBe(false)
    expect(result.trimmedAudio).toBe(false)
    expect(result.params.audioUrl).toBe('https://assets.example.com/audio.wav')
    expect(fetchMock).toHaveBeenCalled()
    expect(uploadObjectMock).not.toHaveBeenCalled()
  })
})
