import { toFetchableUrl } from '@/lib/storage/utils'

export const BAILIAN_TTS_MODEL_ID = 'qwen3-tts-vd-2026-01-26'
const BAILIAN_TTS_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const BAILIAN_TTS_MAX_CHARS = 600

export interface BailianTTSInput {
  text: string
  voiceId: string
  languageType?: string
  modelId?: string
}

export interface BailianTTSResult {
  success: boolean
  audioData?: Buffer
  audioDuration?: number
  audioUrl?: string
  requestId?: string
  error?: string
  characters?: number
}

interface BailianTTSResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    audio?: {
      data?: string
      url?: string
      id?: string
      expires_at?: number
    }
  }
  usage?: {
    characters?: number
  }
}

interface WavFormat {
  audioFormat: number
  numChannels: number
  sampleRate: number
  byteRate: number
  blockAlign: number
  bitsPerSample: number
}

interface WavDecoded {
  format: WavFormat
  data: Buffer
}

interface BailianTTSSegmentResult {
  audioBuffer: Buffer
  audioUrl?: string
  requestId?: string
  characters: number
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const decoded = decodeWavBuffer(buffer)
    if (decoded.format.byteRate <= 0) return 0
    return Math.round((decoded.data.length / decoded.format.byteRate) * 1000)
  } catch {
    return 0
  }
}

function decodeWavBuffer(buffer: Buffer): WavDecoded {
  if (buffer.length < 44) {
    throw new Error('BAILIAN_TTS_WAV_TOO_SHORT')
  }
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('BAILIAN_TTS_WAV_INVALID_HEADER')
  }

  let fmt: WavFormat | null = null
  let pcmData: Buffer | null = null
  let offset = 12

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) {
      throw new Error('BAILIAN_TTS_WAV_CHUNK_OUT_OF_RANGE')
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new Error('BAILIAN_TTS_WAV_FMT_INVALID')
      }
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      }
    } else if (chunkId === 'data') {
      pcmData = buffer.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (!fmt || !pcmData) {
    throw new Error('BAILIAN_TTS_WAV_MISSING_CHUNKS')
  }

  return {
    format: fmt,
    data: Buffer.from(pcmData),
  }
}

function buildWavBuffer(format: WavFormat, pcmData: Buffer): Buffer {
  const headerSize = 44
  const output = Buffer.allocUnsafe(headerSize + pcmData.length)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(36 + pcmData.length, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(format.audioFormat, 20)
  output.writeUInt16LE(format.numChannels, 22)
  output.writeUInt32LE(format.sampleRate, 24)
  output.writeUInt32LE(format.byteRate, 28)
  output.writeUInt16LE(format.blockAlign, 32)
  output.writeUInt16LE(format.bitsPerSample, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(pcmData.length, 40)
  pcmData.copy(output, 44)
  return output
}

function isWavFormatEqual(left: WavFormat, right: WavFormat): boolean {
  return left.audioFormat === right.audioFormat
    && left.numChannels === right.numChannels
    && left.sampleRate === right.sampleRate
    && left.byteRate === right.byteRate
    && left.blockAlign === right.blockAlign
    && left.bitsPerSample === right.bitsPerSample
}

function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('BAILIAN_TTS_SEGMENTS_EMPTY')
  }
  if (buffers.length === 1) {
    return buffers[0]
  }

  const decoded = buffers.map((buffer) => decodeWavBuffer(buffer))
  const [first, ...rest] = decoded
  for (const item of rest) {
    if (!isWavFormatEqual(first.format, item.format)) {
      throw new Error('BAILIAN_TTS_SEGMENT_WAV_FORMAT_MISMATCH')
    }
  }
  const mergedData = Buffer.concat(decoded.map((item) => item.data))
  return buildWavBuffer(first.format, mergedData)
}

const SPLIT_HINT_CHARS = new Set([
  '。', '！', '？', '；', '，', '、',
  '.', '!', '?', ';', ',', ':', '：',
  '\n',
])

function splitTextByLimit(text: string, maxChars: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const chars = Array.from(trimmed)
  if (chars.length <= maxChars) return [trimmed]

  const segments: string[] = []
  let cursor = 0
  while (cursor < chars.length) {
    const hardEnd = Math.min(cursor + maxChars, chars.length)
    if (hardEnd === chars.length) {
      const segment = chars.slice(cursor, hardEnd).join('').trim()
      if (segment) segments.push(segment)
      break
    }

    let splitPoint = hardEnd
    for (let index = hardEnd - 1; index > cursor; index -= 1) {
      if (SPLIT_HINT_CHARS.has(chars[index])) {
        splitPoint = index + 1
        break
      }
    }

    const segment = chars.slice(cursor, splitPoint).join('').trim()
    if (!segment) {
      throw new Error('BAILIAN_TTS_SPLIT_FAILED')
    }
    segments.push(segment)
    cursor = splitPoint
    while (cursor < chars.length && /\s/.test(chars[cursor])) {
      cursor += 1
    }
  }

  return segments
}

async function parseBailianTTSResponse(response: Response): Promise<BailianTTSResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_TTS_RESPONSE_INVALID')
    }
    return parsed as BailianTTSResponse
  } catch {
    throw new Error('BAILIAN_TTS_RESPONSE_INVALID_JSON')
  }
}

async function readAudioBufferFromResponseAudio(audio: NonNullable<BailianTTSResponse['output']>['audio']): Promise<{
  audioBuffer: Buffer
  audioUrl?: string
}> {
  const audioDataBase64 = readTrimmedString(audio?.data)
  const audioUrl = readTrimmedString(audio?.url)

  if (audioDataBase64) {
    return {
      audioBuffer: Buffer.from(audioDataBase64, 'base64'),
      audioUrl: audioUrl || undefined,
    }
  }
  if (!audioUrl) {
    throw new Error('BAILIAN_TTS_AUDIO_MISSING')
  }

  const audioResponse = await fetch(toFetchableUrl(audioUrl))
  if (!audioResponse.ok) {
    throw new Error(`BAILIAN_TTS_AUDIO_DOWNLOAD_FAILED(${audioResponse.status})`)
  }
  const arrayBuffer = await audioResponse.arrayBuffer()
  return {
    audioBuffer: Buffer.from(arrayBuffer),
    audioUrl,
  }
}

async function synthesizeSegment(params: {
  text: string
  voiceId: string
  languageType: string
  modelId: string
  apiKey: string
}): Promise<BailianTTSSegmentResult> {
  const response = await fetch(BAILIAN_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.modelId,
      input: {
        text: params.text,
        voice: params.voiceId,
        language_type: params.languageType,
      },
    }),
  })
  const data = await parseBailianTTSResponse(response)
  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_TTS_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  const outputAudio = data.output?.audio
  if (!outputAudio) {
    throw new Error('BAILIAN_TTS_OUTPUT_AUDIO_MISSING')
  }

  const audio = await readAudioBufferFromResponseAudio(outputAudio)
  const characters = typeof data.usage?.characters === 'number' && Number.isFinite(data.usage.characters)
    ? data.usage.characters
    : 0

  return {
    audioBuffer: audio.audioBuffer,
    audioUrl: audio.audioUrl,
    requestId: readTrimmedString(data.request_id) || undefined,
    characters,
  }
}

export async function synthesizeWithBailianTTS(
  input: BailianTTSInput,
  apiKey: string,
): Promise<BailianTTSResult> {
  const text = readTrimmedString(input.text)
  const voiceId = readTrimmedString(input.voiceId)
  const languageType = readTrimmedString(input.languageType) || 'Chinese'
  const modelId = readTrimmedString(input.modelId) || BAILIAN_TTS_MODEL_ID

  if (!apiKey.trim()) {
    return { success: false, error: 'BAILIAN_API_KEY_REQUIRED' }
  }
  if (!text) {
    return { success: false, error: 'BAILIAN_TTS_TEXT_REQUIRED' }
  }
  if (!voiceId) {
    return { success: false, error: 'BAILIAN_TTS_VOICE_ID_REQUIRED' }
  }

  const segments = splitTextByLimit(text, BAILIAN_TTS_MAX_CHARS)
  if (segments.length === 0) {
    return { success: false, error: 'BAILIAN_TTS_TEXT_REQUIRED' }
  }

  try {
    const buffers: Buffer[] = []
    let totalCharacters = 0
    let lastRequestId: string | undefined
    let firstAudioUrl: string | undefined

    for (const segment of segments) {
      const result = await synthesizeSegment({
        text: segment,
        voiceId,
        languageType,
        modelId,
        apiKey,
      })
      buffers.push(result.audioBuffer)
      totalCharacters += result.characters
      if (!firstAudioUrl && result.audioUrl) {
        firstAudioUrl = result.audioUrl
      }
      if (result.requestId) {
        lastRequestId = result.requestId
      }
    }

    const mergedAudio = mergeWavBuffers(buffers)
    return {
      success: true,
      audioData: mergedAudio,
      audioDuration: getWavDurationFromBuffer(mergedAudio),
      audioUrl: segments.length === 1 ? firstAudioUrl : undefined,
      requestId: lastRequestId,
      characters: totalCharacters,
    }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'BAILIAN_TTS_UNKNOWN_ERROR',
    }
  }
}
