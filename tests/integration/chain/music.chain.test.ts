import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type AddCall = {
  jobName: string
  data: TaskJobData
  options: Record<string, unknown>
}

const queueState = vi.hoisted(() => ({
  addCallsByQueue: new Map<string, AddCall[]>(),
}))

const workerState = vi.hoisted(() => ({
  processor: null as ((job: Job<TaskJobData>) => Promise<unknown>) | null,
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (job: Job<TaskJobData>, handler: (j: Job<TaskJobData>) => Promise<unknown>) => await handler(job)),
}))
const generateMusicMock = vi.hoisted(() => vi.fn())
const uploadObjectMock = vi.hoisted(() => vi.fn())
const ensureMediaObjectFromStorageKeyMock = vi.hoisted(() => vi.fn())

vi.mock('bullmq', () => ({
  Queue: class {
    private readonly queueName: string

    constructor(queueName: string) {
      this.queueName = queueName
    }

    async add(jobName: string, data: TaskJobData, options: Record<string, unknown>) {
      const list = queueState.addCallsByQueue.get(this.queueName) || []
      list.push({ jobName, data, options })
      queueState.addCallsByQueue.set(this.queueName, list)
      return { id: data.taskId }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(_name: string, processor: (job: Job<TaskJobData>) => Promise<unknown>) {
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
  withTaskLifecycle: workerMock.withTaskLifecycle,
}))
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

function toJob(data: TaskJobData): Job<TaskJobData> {
  return { data } as unknown as Job<TaskJobData>
}

describe('chain contract - music queue behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueState.addCallsByQueue.clear()
    workerState.processor = null
    generateMusicMock.mockResolvedValue({
      success: true,
      audioBase64: 'ZmFrZS1tcDM=',
      audioMimeType: 'audio/mpeg',
      metadata: { text: 'ok' },
    })
    uploadObjectMock.mockResolvedValue('music/asset.mp3')
    ensureMediaObjectFromStorageKeyMock.mockResolvedValue({
      id: 'media-1',
      url: '/m/media-1',
    })
  })

  it('MUSIC_GENERATE is enqueued into music queue', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-music-1',
      type: TASK_TYPE.MUSIC_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: {
        musicModel: 'google::lyria-3-clip-preview',
        prompt: 'tense chase cue',
        durationSeconds: 30,
      },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.MUSIC) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      jobName: TASK_TYPE.MUSIC_GENERATE,
      options: expect.objectContaining({ jobId: 'task-music-1', priority: 0 }),
    }))
  })

  it('queued music job payload can be consumed by music worker and returns media result', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')
    const { createMusicWorker } = await import('@/lib/workers/music.worker')
    createMusicWorker()
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    await addTaskJob({
      taskId: 'task-music-chain-worker-1',
      type: TASK_TYPE.MUSIC_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: {
        musicModel: 'google::lyria-3-clip-preview',
        prompt: 'tense chase cue',
        durationSeconds: 30,
        vocalMode: 'instrumental',
        outputFormat: 'mp3',
      },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.MUSIC) || []
    const queued = calls[0]?.data
    expect(queued?.type).toBe(TASK_TYPE.MUSIC_GENERATE)

    const result = await processor!(toJob(queued!))
    expect(result).toEqual({
      mediaId: 'media-1',
      audioUrl: '/m/media-1',
      storageKey: 'music/asset.mp3',
      musicModel: 'google::lyria-3-clip-preview',
      provider: 'google',
      metadata: { text: 'ok' },
    })
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
    expect(uploadObjectMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      'music/asset.mp3',
      1,
      'audio/mpeg',
    )
  })
})
