import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const generateMusicMock = vi.hoisted(() => vi.fn())
const uploadObjectMock = vi.hoisted(() => vi.fn())
const ensureMediaObjectFromStorageKeyMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai-exec/engine', () => ({
  generateMusic: generateMusicMock,
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: uploadObjectMock,
}))

vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: ensureMediaObjectFromStorageKeyMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  withTaskLifecycle: vi.fn(),
}))

vi.mock('@/lib/redis', () => ({
  queueRedis: {},
}))

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-music',
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.MUSIC_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'Project',
      targetId: 'project-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  } as unknown as Job<TaskJobData>
}

describe('music worker', () => {
  it('generates music, uploads audio, creates MediaObject, and returns the media result', async () => {
    const { handleMusicGenerateTask } = await import('@/lib/workers/music.worker')
    generateMusicMock.mockResolvedValue({
      success: true,
      audioBase64: 'ZmFrZS1tcDM=',
      audioMimeType: 'audio/mpeg',
      metadata: { text: 'adapter notes' },
    })
    uploadObjectMock.mockResolvedValue('music/asset.mp3')
    ensureMediaObjectFromStorageKeyMock.mockResolvedValue({
      id: 'media-1',
      url: '/m/media-public-id',
    })

    const result = await handleMusicGenerateTask(buildJob({
      musicModel: 'google::lyria-3-clip-preview',
      prompt: 'tense chase cue',
      durationSeconds: 30,
      vocalMode: 'instrumental',
      outputFormat: 'mp3',
    }))

    expect(generateMusicMock).toHaveBeenCalledWith(
      'user-1',
      'google::lyria-3-clip-preview',
      'tense chase cue',
      {
        durationSeconds: 30,
        vocalMode: 'instrumental',
        outputFormat: 'mp3',
      },
    )
    const uploadCall = uploadObjectMock.mock.calls[0]
    expect(uploadCall?.[1]).toBe('music/asset.mp3')
    expect(uploadCall?.[3]).toBe('audio/mpeg')
    expect(ensureMediaObjectFromStorageKeyMock).toHaveBeenCalledWith('music/asset.mp3', {
      mimeType: 'audio/mpeg',
      sizeBytes: 8,
      durationMs: 30000,
    })
    expect(result).toEqual({
      mediaId: 'media-1',
      audioUrl: '/m/media-public-id',
      storageKey: 'music/asset.mp3',
      musicModel: 'google::lyria-3-clip-preview',
      provider: 'google',
      metadata: { text: 'adapter notes' },
    })
  })
})
