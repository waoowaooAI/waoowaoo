import { beforeEach, describe, expect, it, vi } from 'vitest'

const queueInstances: Array<{
  add: ReturnType<typeof vi.fn>
  getJob: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}> = []

const QueueMock = vi.hoisted(() => vi.fn().mockImplementation(() => {
  const instance = {
    add: vi.fn(),
    getJob: vi.fn(),
    close: vi.fn(),
  }
  queueInstances.push(instance)
  return instance
}))

vi.mock('bullmq', () => ({
  Queue: QueueMock,
}))

vi.mock('@/lib/redis', () => ({
  queueRedis: {},
}))

describe('task queues', () => {
  beforeEach(() => {
    vi.resetModules()
    QueueMock.mockClear()
    queueInstances.length = 0
    delete (globalThis as typeof globalThis & { __waoowaooQueues?: unknown }).__waoowaooQueues
  })

  it('importing the module does not instantiate queues eagerly', async () => {
    await import('@/lib/task/queues')

    expect(QueueMock).not.toHaveBeenCalled()
  })

  it('requesting a queue lazily instantiates only the needed queue', async () => {
    const queuesModule = await import('@/lib/task/queues')

    const queue = queuesModule.getQueueByType('image')

    expect(queue).toBeDefined()
    expect(QueueMock).toHaveBeenCalledTimes(1)
  })
})
