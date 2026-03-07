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

const voiceMock = vi.hoisted(() => ({
  generateVoiceLine: vi.fn(),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (job: Job<TaskJobData>, handler: (j: Job<TaskJobData>) => Promise<unknown>) => await handler(job)),
}))

const voiceDesignMock = vi.hoisted(() => ({
  handleVoiceDesignTask: vi.fn(),
}))

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
vi.mock('@/lib/voice/generate-voice-line', () => ({
  generateVoiceLine: voiceMock.generateVoiceLine,
}))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
  withTaskLifecycle: workerMock.withTaskLifecycle,
}))
vi.mock('@/lib/workers/handlers/voice-design', () => ({
  handleVoiceDesignTask: voiceDesignMock.handleVoiceDesignTask,
}))

function toJob(data: TaskJobData): Job<TaskJobData> {
  return { data } as unknown as Job<TaskJobData>
}

describe('chain contract - voice queue behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueState.addCallsByQueue.clear()
    workerState.processor = null
    voiceMock.generateVoiceLine.mockResolvedValue({
      lineId: 'line-1',
      audioUrl: 'cos/voice-line-1.mp3',
    })
    voiceDesignMock.handleVoiceDesignTask.mockResolvedValue({
      presetId: 'voice-design-1',
      previewAudioUrl: 'cos/preview-1.mp3',
    })
  })

  it('VOICE_LINE is enqueued into voice queue', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-voice-1',
      type: TASK_TYPE.VOICE_LINE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionVoiceLine',
      targetId: 'line-1',
      payload: { lineId: 'line-1', episodeId: 'episode-1' },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.VOICE) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      jobName: TASK_TYPE.VOICE_LINE,
      options: expect.objectContaining({ jobId: 'task-voice-1', priority: 0 }),
    }))
  })

  it('ASSET_HUB_VOICE_DESIGN is enqueued into voice queue', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-voice-2',
      type: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
      locale: 'zh',
      projectId: 'global-asset-hub',
      episodeId: null,
      targetType: 'GlobalAssetHubVoiceDesign',
      targetId: 'voice-design-1',
      payload: { voicePrompt: 'female calm narrator' },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.VOICE) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]?.data.type).toBe(TASK_TYPE.ASSET_HUB_VOICE_DESIGN)
  })

  it('queued voice job payload can be consumed by voice worker and forwarded with concrete params', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')
    const { createVoiceWorker } = await import('@/lib/workers/voice.worker')
    createVoiceWorker()
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    await addTaskJob({
      taskId: 'task-voice-chain-worker-1',
      type: TASK_TYPE.VOICE_LINE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionVoiceLine',
      targetId: 'line-1',
      payload: {
        lineId: 'line-1',
        episodeId: 'episode-1',
        audioModel: 'fal::voice-model',
      },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.VOICE) || []
    const queued = calls[0]?.data
    expect(queued?.type).toBe(TASK_TYPE.VOICE_LINE)

    const result = await processor!(toJob(queued!))
    expect(result).toEqual({
      lineId: 'line-1',
      audioUrl: 'cos/voice-line-1.mp3',
    })
    expect(voiceMock.generateVoiceLine).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      lineId: 'line-1',
      userId: 'user-1',
      audioModel: 'fal::voice-model',
    })
  })
})
