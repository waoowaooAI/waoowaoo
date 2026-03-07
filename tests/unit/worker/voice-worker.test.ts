import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const generateVoiceLineMock = vi.hoisted(() => vi.fn())
const handleVoiceDesignTaskMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const withTaskLifecycleMock = vi.hoisted(() =>
  vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
)

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(_name: string) {}

    async add() {
      return { id: 'job-1' }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(_name: string, processor: WorkerProcessor) {
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({
  queueRedis: {},
}))

vi.mock('@/lib/voice/generate-voice-line', () => ({
  generateVoiceLine: generateVoiceLineMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  withTaskLifecycle: withTaskLifecycleMock,
}))

vi.mock('@/lib/workers/handlers/voice-design', () => ({
  handleVoiceDesignTask: handleVoiceDesignTaskMock,
}))

function buildJob(params: {
  type: TaskJobData['type']
  targetType?: string
  targetId?: string
  episodeId?: string | null
  payload?: Record<string, unknown>
}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: params.type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: params.episodeId !== undefined ? params.episodeId : 'episode-1',
      targetType: params.targetType ?? 'NovelPromotionVoiceLine',
      targetId: params.targetId ?? 'line-1',
      payload: params.payload ?? {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker voice processor behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerState.processor = null

    generateVoiceLineMock.mockResolvedValue({
      lineId: 'line-1',
      audioUrl: 'cos/voice-line-1.mp3',
    })
    handleVoiceDesignTaskMock.mockResolvedValue({
      presetId: 'preset-1',
      previewAudioUrl: 'cos/preset-1.mp3',
    })

    const mod = await import('@/lib/workers/voice.worker')
    mod.createVoiceWorker()
  })

  it('VOICE_LINE: lineId/episodeId 缺失时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const missingLineJob = buildJob({
      type: TASK_TYPE.VOICE_LINE,
      targetId: '',
      payload: { episodeId: 'episode-1' },
    })
    await expect(processor!(missingLineJob)).rejects.toThrow('VOICE_LINE task missing lineId')

    const missingEpisodeJob = buildJob({
      type: TASK_TYPE.VOICE_LINE,
      episodeId: null,
      targetId: 'line-1',
      payload: {},
    })
    await expect(processor!(missingEpisodeJob)).rejects.toThrow('VOICE_LINE task missing episodeId')
  })

  it('VOICE_LINE: 正常生成时把核心参数传给 generateVoiceLine', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VOICE_LINE,
      payload: {
        lineId: 'line-9',
        episodeId: 'episode-9',
        audioModel: 'fal::voice-model',
      },
    })

    const result = await processor!(job)
    expect(result).toEqual({ lineId: 'line-1', audioUrl: 'cos/voice-line-1.mp3' })
    expect(generateVoiceLineMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-9',
      lineId: 'line-9',
      userId: 'user-1',
      audioModel: 'fal::voice-model',
    })
  })

  it('VOICE_DESIGN / ASSET_HUB_VOICE_DESIGN: 路由到 voice design handler', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const designJob = buildJob({
      type: TASK_TYPE.VOICE_DESIGN,
      targetType: 'NovelPromotionVoiceDesign',
      targetId: 'voice-design-1',
    })

    const assetHubJob = buildJob({
      type: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
      targetType: 'GlobalAssetHubVoiceDesign',
      targetId: 'asset-hub-voice-design-1',
    })

    await processor!(designJob)
    await processor!(assetHubJob)

    expect(handleVoiceDesignTaskMock).toHaveBeenCalledTimes(2)
    expect(generateVoiceLineMock).not.toHaveBeenCalled()
  })

  it('未知任务类型: 显式报错', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const unsupportedJob = buildJob({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
      targetId: 'character-1',
    })

    await expect(processor!(unsupportedJob)).rejects.toThrow('Unsupported voice task type')
  })
})
