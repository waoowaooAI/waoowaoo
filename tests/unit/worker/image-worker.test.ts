import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
}))

const handlerMock = vi.hoisted(() => ({
  handleAssetHubImageTask: vi.fn(async () => ({ ok: true })),
  handleAssetHubModifyTask: vi.fn(async () => ({ ok: true })),
  handleCharacterImageTask: vi.fn(async () => ({ ok: true })),
  handleLocationImageTask: vi.fn(async () => ({ ok: true })),
  handleModifyAssetImageTask: vi.fn(async () => ({ ok: true })),
  handlePanelImageTask: vi.fn(async () => ({ ok: true })),
  handlePanelVariantTask: vi.fn(async () => ({ ok: true })),
}))

const configServiceMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 5,
    image: 5,
    video: 5,
  })),
}))

const gateMock = vi.hoisted(() => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: {
    run: () => Promise<T>
  }) => await input.run()),
}))

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

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => sharedMock)
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/workers/user-concurrency-gate', () => gateMock)
vi.mock('@/lib/workers/handlers/image-task-handlers', () => handlerMock)

function buildJob(type: TaskJobData['type']): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-image-1',
      type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker image concurrency behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerState.processor = null

    const mod = await import('@/lib/workers/image.worker')
    mod.createImageWorker()
  })

  it('reads user image concurrency and applies gate before processing', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob(TASK_TYPE.IMAGE_PANEL)
    await processor!(job)

    expect(configServiceMock.getUserWorkflowConcurrencyConfig).toHaveBeenCalledWith('user-1')
    expect(gateMock.withUserConcurrencyGate).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'image',
      userId: 'user-1',
      limit: 5,
    }))
    expect(handlerMock.handlePanelImageTask).toHaveBeenCalledWith(job)
  })
})
