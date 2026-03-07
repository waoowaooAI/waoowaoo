import { describe, expect, it } from 'vitest'
import { withUserConcurrencyGate } from '@/lib/workers/user-concurrency-gate'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('user concurrency gate', () => {
  it('enforces max concurrent runs for same user and scope', async () => {
    let activeCount = 0
    let maxActiveCount = 0

    const runTask = async (taskId: number) => await withUserConcurrencyGate({
      scope: 'video',
      userId: 'user-gate-video',
      limit: 2,
      run: async () => {
        void taskId
        activeCount += 1
        maxActiveCount = Math.max(maxActiveCount, activeCount)
        await wait(20)
        activeCount -= 1
      },
    })

    await Promise.all([
      runTask(1),
      runTask(2),
      runTask(3),
      runTask(4),
    ])

    expect(maxActiveCount).toBe(2)
  })

  it('does not share slots between different users', async () => {
    let activeCount = 0
    let maxActiveCount = 0

    await Promise.all([
      withUserConcurrencyGate({
        scope: 'image',
        userId: 'user-gate-image-a',
        limit: 1,
        run: async () => {
          activeCount += 1
          maxActiveCount = Math.max(maxActiveCount, activeCount)
          await wait(20)
          activeCount -= 1
        },
      }),
      withUserConcurrencyGate({
        scope: 'image',
        userId: 'user-gate-image-b',
        limit: 1,
        run: async () => {
          activeCount += 1
          maxActiveCount = Math.max(maxActiveCount, activeCount)
          await wait(20)
          activeCount -= 1
        },
      }),
    ])

    expect(maxActiveCount).toBe(2)
  })

  it('throws when concurrency limit is invalid', async () => {
    await expect(withUserConcurrencyGate({
      scope: 'video',
      userId: 'user-gate-invalid',
      limit: 0,
      run: async () => undefined,
    })).rejects.toThrow('WORKFLOW_CONCURRENCY_INVALID')
  })
})
