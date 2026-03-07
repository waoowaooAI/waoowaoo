import { randomUUID } from 'node:crypto'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { toFetchableUrl } from '@/lib/storage/utils'
import type { LipSyncParams } from '@/lib/lipsync/types'

const LIPSYNC_MIN_AUDIO_DURATION_MS = 2000

export type LipSyncProviderKey = 'fal' | 'vidu' | 'bailian'

interface LoadedBinary {
  buffer: Buffer
  mimeType: string
}

interface WavInfo {
  byteRate: number
  blockAlign: number
  dataSize: number
  dataOffset: number
}

interface Mp4Box {
  start: number
  end: number
  type: string
  headerSize: number
}

export interface LipSyncPreprocessContext {
  providerKey: LipSyncProviderKey
}

export interface LipSyncPreprocessResult {
  params: LipSyncParams
  paddedAudio: boolean
  trimmedAudio: boolean
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.round(value)
}

function parseDataUrl(input: string): LoadedBinary {
  const marker = input.indexOf(',')
  if (marker <= 5) {
    throw new Error('LIPSYNC_AUDIO_DATA_URL_INVALID')
  }
  const header = input.slice(5, marker)
  const payload = input.slice(marker + 1)
  if (!header.includes(';base64')) {
    throw new Error('LIPSYNC_AUDIO_DATA_URL_BASE64_REQUIRED')
  }
  const contentTypeRaw = header.split(';')[0]
  const mimeType = readTrimmedString(contentTypeRaw) || 'application/octet-stream'
  return {
    mimeType,
    buffer: Buffer.from(payload, 'base64'),
  }
}

async function loadBinaryFromInput(input: string): Promise<LoadedBinary> {
  const trimmed = readTrimmedString(input)
  if (!trimmed) {
    throw new Error('LIPSYNC_INPUT_EMPTY')
  }

  if (trimmed.startsWith('data:')) {
    return parseDataUrl(trimmed)
  }

  const normalizedUrl = await normalizeToOriginalMediaUrl(trimmed)
  if (normalizedUrl.startsWith('data:')) {
    return parseDataUrl(normalizedUrl)
  }

  const fetchUrl = toFetchableUrl(normalizedUrl)
  const response = await fetch(fetchUrl)
  if (!response.ok) {
    throw new Error(`LIPSYNC_INPUT_FETCH_FAILED(${response.status})`)
  }
  const mimeType = readTrimmedString(response.headers.get('content-type')) || 'application/octet-stream'
  return {
    mimeType,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

function parseWavInfo(buffer: Buffer): WavInfo | null {
  if (buffer.length < 44) return null
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (buffer.subarray(8, 12).toString('ascii') !== 'WAVE') return null

  let offset = 12
  let byteRate = 0
  let blockAlign = 0
  let dataSize = 0
  let dataOffset = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) return null

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) return null
      byteRate = buffer.readUInt32LE(chunkStart + 8)
      blockAlign = buffer.readUInt16LE(chunkStart + 12)
    } else if (chunkId === 'data') {
      dataSize = chunkSize
      dataOffset = chunkStart
      break
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (byteRate <= 0 || blockAlign <= 0 || dataSize <= 0 || dataOffset <= 0) {
    return null
  }

  return {
    byteRate,
    blockAlign,
    dataSize,
    dataOffset,
  }
}

function getWavDurationMs(buffer: Buffer): number | null {
  const info = parseWavInfo(buffer)
  if (!info) return null
  return Math.round((info.dataSize / info.byteRate) * 1000)
}

function toBlockAlignedByteLength(byteLength: number, blockAlign: number): number {
  if (blockAlign <= 1) return byteLength
  return Math.floor(byteLength / blockAlign) * blockAlign
}

function padWavToMinDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = parseWavInfo(buffer)
  if (!info) {
    throw new Error('LIPSYNC_AUDIO_WAV_PARSE_FAILED')
  }

  const currentDurationMs = Math.round((info.dataSize / info.byteRate) * 1000)
  if (currentDurationMs >= targetDurationMs) {
    return buffer
  }

  const targetBytesRaw = Math.ceil((targetDurationMs / 1000) * info.byteRate)
  const targetBytes = toBlockAlignedByteLength(targetBytesRaw, info.blockAlign)
  const additionalBytes = targetBytes - info.dataSize
  if (additionalBytes <= 0) return buffer

  const header = buffer.subarray(0, info.dataOffset)
  const originalData = buffer.subarray(info.dataOffset, info.dataOffset + info.dataSize)
  const silenceData = Buffer.alloc(additionalBytes, 0)
  const merged = Buffer.concat([header, originalData, silenceData])

  merged.writeUInt32LE(merged.length - 8, 4)
  let offset = 12
  while (offset + 8 <= merged.length) {
    const chunkId = merged.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = merged.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      merged.writeUInt32LE(info.dataSize + additionalBytes, offset + 4)
      break
    }
    offset = offset + 8 + chunkSize + (chunkSize % 2)
  }

  return merged
}

function trimWavToDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = parseWavInfo(buffer)
  if (!info) {
    throw new Error('LIPSYNC_AUDIO_WAV_PARSE_FAILED')
  }

  const currentDurationMs = Math.round((info.dataSize / info.byteRate) * 1000)
  if (currentDurationMs <= targetDurationMs) {
    return buffer
  }

  const targetBytesRaw = Math.floor((targetDurationMs / 1000) * info.byteRate)
  const targetBytes = toBlockAlignedByteLength(Math.max(targetBytesRaw, info.blockAlign), info.blockAlign)
  const clippedBytes = Math.min(targetBytes, info.dataSize)

  const header = buffer.subarray(0, info.dataOffset)
  const clippedData = buffer.subarray(info.dataOffset, info.dataOffset + clippedBytes)
  const merged = Buffer.concat([header, clippedData])

  merged.writeUInt32LE(merged.length - 8, 4)
  let offset = 12
  while (offset + 8 <= merged.length) {
    const chunkId = merged.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = merged.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      merged.writeUInt32LE(clippedBytes, offset + 4)
      break
    }
    offset = offset + 8 + chunkSize + (chunkSize % 2)
  }

  return merged
}

function readUint64BE(buffer: Buffer, offset: number): number {
  const high = buffer.readUInt32BE(offset)
  const low = buffer.readUInt32BE(offset + 4)
  return high * 2 ** 32 + low
}

function readMp4Box(buffer: Buffer, offset: number, limit: number): Mp4Box | null {
  if (offset + 8 > limit) return null
  const size32 = buffer.readUInt32BE(offset)
  const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
  if (!type) return null

  let headerSize = 8
  let size = size32
  if (size32 === 1) {
    if (offset + 16 > limit) return null
    size = readUint64BE(buffer, offset + 8)
    headerSize = 16
  } else if (size32 === 0) {
    size = limit - offset
  }

  if (size < headerSize || offset + size > limit) return null

  return {
    start: offset,
    end: offset + size,
    type,
    headerSize,
  }
}

function parseMp4DurationMs(buffer: Buffer): number {
  const limit = buffer.length
  let offset = 0
  while (offset + 8 <= limit) {
    const box = readMp4Box(buffer, offset, limit)
    if (!box) break
    if (box.type === 'moov') {
      let innerOffset = box.start + box.headerSize
      while (innerOffset + 8 <= box.end) {
        const inner = readMp4Box(buffer, innerOffset, box.end)
        if (!inner) break
        if (inner.type === 'mvhd') {
          const contentOffset = inner.start + inner.headerSize
          if (contentOffset + 1 > inner.end) {
            throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
          }
          const version = buffer.readUInt8(contentOffset)
          if (version === 0) {
            if (contentOffset + 20 > inner.end) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            const timescale = buffer.readUInt32BE(contentOffset + 12)
            const duration = buffer.readUInt32BE(contentOffset + 16)
            if (timescale <= 0 || duration <= 0) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            return Math.round((duration / timescale) * 1000)
          }
          if (version === 1) {
            if (contentOffset + 32 > inner.end) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            const timescale = buffer.readUInt32BE(contentOffset + 20)
            const duration = readUint64BE(buffer, contentOffset + 24)
            if (timescale <= 0 || duration <= 0) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            return Math.round((duration / timescale) * 1000)
          }
          throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
        }
        innerOffset = inner.end
      }
      throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
    }
    offset = box.end
  }
  throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
}

async function resolveVideoDurationMs(params: LipSyncParams): Promise<number | null> {
  const knownDuration = normalizeDurationMs(params.videoDurationMs)
  if (knownDuration) return knownDuration
  const videoBinary = await loadBinaryFromInput(params.videoUrl)
  return parseMp4DurationMs(videoBinary.buffer)
}

function toAudioDataUrl(buffer: Buffer): string {
  return `data:audio/wav;base64,${buffer.toString('base64')}`
}

async function toProviderAudioInput(
  providerKey: LipSyncProviderKey,
  buffer: Buffer,
): Promise<string> {
  if (providerKey === 'vidu') {
    const { uploadObject, getSignedUrl } = await import('@/lib/storage')
    const storageKey = `voice/temp/lip-sync-preprocessed/${randomUUID()}.wav`
    await uploadObject(buffer, storageKey, 1, 'audio/wav')
    return toFetchableUrl(getSignedUrl(storageKey, 7200))
  }

  return toAudioDataUrl(buffer)
}

export async function preprocessLipSyncParams(
  params: LipSyncParams,
  context: LipSyncPreprocessContext,
): Promise<LipSyncPreprocessResult> {
  const inputAudioDurationMs = normalizeDurationMs(params.audioDurationMs)
  const videoDurationMs = await resolveVideoDurationMs(params)
  let audioDurationMs = inputAudioDurationMs

  const needsDurationProbe = audioDurationMs === null
  const shouldPadByKnown = audioDurationMs !== null && audioDurationMs < LIPSYNC_MIN_AUDIO_DURATION_MS
  const shouldTrimByKnown = audioDurationMs !== null && videoDurationMs !== null && audioDurationMs > videoDurationMs

  if (!needsDurationProbe && !shouldPadByKnown && !shouldTrimByKnown) {
    return {
      params: {
        ...params,
        videoDurationMs: videoDurationMs ?? params.videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  const audioBinary = await loadBinaryFromInput(params.audioUrl)
  if (!audioBinary.mimeType.includes('wav') && parseWavInfo(audioBinary.buffer) === null) {
    throw new Error('LIPSYNC_AUDIO_PREPROCESS_WAV_REQUIRED')
  }

  const parsedAudioDuration = getWavDurationMs(audioBinary.buffer)
  if (audioDurationMs === null) {
    if (parsedAudioDuration === null) {
      throw new Error('LIPSYNC_AUDIO_DURATION_PARSE_FAILED')
    }
    audioDurationMs = parsedAudioDuration
  }

  let processedAudio = audioBinary.buffer
  let paddedAudio = false
  let trimmedAudio = false

  if (audioDurationMs < LIPSYNC_MIN_AUDIO_DURATION_MS) {
    processedAudio = padWavToMinDuration(processedAudio, LIPSYNC_MIN_AUDIO_DURATION_MS)
    audioDurationMs = getWavDurationMs(processedAudio) ?? LIPSYNC_MIN_AUDIO_DURATION_MS
    paddedAudio = true
  }

  if (videoDurationMs !== null && audioDurationMs > videoDurationMs) {
    processedAudio = trimWavToDuration(processedAudio, videoDurationMs)
    audioDurationMs = getWavDurationMs(processedAudio) ?? videoDurationMs
    trimmedAudio = true
  }

  if (!paddedAudio && !trimmedAudio) {
    return {
      params: {
        ...params,
        audioDurationMs,
        videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  const providerAudioInput = await toProviderAudioInput(context.providerKey, processedAudio)

  _ulogInfo(`[LipSync Preprocess] provider=${context.providerKey} padded=${paddedAudio} trimmed=${trimmedAudio} audioDurationMs=${audioDurationMs} videoDurationMs=${videoDurationMs ?? 'unknown'}`)

  return {
    params: {
      ...params,
      audioUrl: providerAudioInput,
      audioDurationMs,
      videoDurationMs,
    },
    paddedAudio,
    trimmedAudio,
  }
}

export const LIPSYNC_PREPROCESS_AUDIO_MIN_MS = LIPSYNC_MIN_AUDIO_DURATION_MS
