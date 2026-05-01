import { Worker, type Job } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { generateMusic } from '@/lib/ai-exec/engine'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { generateUniqueKey, toFetchableUrl, uploadObject } from '@/lib/storage'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'

type MusicPayload = {
  musicModel?: unknown
  prompt?: unknown
  durationSeconds?: unknown
  vocalMode?: unknown
  genre?: unknown
  mood?: unknown
  bpm?: unknown
  outputFormat?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`MUSIC_GENERATE_${field.toUpperCase()}_INVALID`)
  }
  return value
}

function readOptionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`MUSIC_GENERATE_${field.toUpperCase()}_INVALID`)
  }
  return value
}

function readOptionalEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`MUSIC_GENERATE_${field.toUpperCase()}_INVALID`)
  }
  return value as T
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return 'mp3'
}

function decodeAudioDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:(audio\/[^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) return null
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

async function loadAudioBuffer(input: { audioBase64?: string; audioUrl?: string; mimeType?: string }): Promise<{ buffer: Buffer; mimeType: string }> {
  const explicitMimeType = readString(input.mimeType) || 'audio/mpeg'
  if (input.audioBase64) {
    return {
      buffer: Buffer.from(input.audioBase64, 'base64'),
      mimeType: explicitMimeType,
    }
  }

  const dataUrl = readString(input.audioUrl)
  if (!dataUrl) {
    throw new Error('MUSIC_GENERATE_EMPTY_AUDIO_RESULT')
  }
  const decoded = decodeAudioDataUrl(dataUrl)
  if (decoded) return decoded

  const response = await fetch(toFetchableUrl(dataUrl))
  if (!response.ok) {
    throw new Error(`MUSIC_GENERATE_AUDIO_DOWNLOAD_FAILED:${response.status}`)
  }
  const contentType = response.headers.get('content-type') || explicitMimeType
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType,
  }
}

export async function handleMusicGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as MusicPayload
  const musicModel = readString(payload.musicModel)
  const prompt = readString(payload.prompt)
  const durationSeconds = readPositiveInteger(payload.durationSeconds, 'durationSeconds')
  if (!musicModel) throw new Error('MUSIC_GENERATE_MODEL_REQUIRED')
  if (!prompt) throw new Error('MUSIC_GENERATE_PROMPT_REQUIRED')

  const vocalMode = readOptionalEnum(payload.vocalMode, ['instrumental', 'vocal'] as const, 'vocalMode')
  const outputFormat = readOptionalEnum(payload.outputFormat, ['mp3', 'wav'] as const, 'outputFormat')
  const bpm = readOptionalInteger(payload.bpm, 'bpm')
  const genre = readString(payload.genre)
  const mood = readString(payload.mood)

  await reportTaskProgress(job, 20, { stage: 'generate_music_submit' })

  const generated = await generateMusic(job.data.userId, musicModel, prompt, {
    durationSeconds,
    ...(vocalMode ? { vocalMode } : {}),
    ...(genre ? { genre } : {}),
    ...(mood ? { mood } : {}),
    ...(typeof bpm === 'number' ? { bpm } : {}),
    ...(outputFormat ? { outputFormat } : {}),
  })
  if (!generated.success) {
    throw new Error(generated.error || 'MUSIC_GENERATE_PROVIDER_FAILED')
  }

  await reportTaskProgress(job, 85, { stage: 'persist_music' })

  const audio = await loadAudioBuffer({
    audioBase64: generated.audioBase64,
    audioUrl: generated.audioUrl,
    mimeType: generated.audioMimeType,
  })
  const storageKey = await uploadObject(
    audio.buffer,
    generateUniqueKey('music', extensionFromMimeType(audio.mimeType)),
    1,
    audio.mimeType,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: audio.mimeType,
    sizeBytes: audio.buffer.byteLength,
    durationMs: durationSeconds * 1000,
  })

  return {
    mediaId: media.id,
    audioUrl: media.url,
    storageKey,
    musicModel,
    provider: musicModel.split('::')[0] || null,
    metadata: generated.metadata || {},
  }
}

async function processMusicTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.MUSIC_GENERATE:
      return await handleMusicGenerateTask(job)
    default:
      throw new Error(`Unsupported music task type: ${job.data.type}`)
  }
}

export function createMusicWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.MUSIC,
    async (job) => await withTaskLifecycle(job, processMusicTask),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_MUSIC || '3', 10) || 3,
    },
  )
}
