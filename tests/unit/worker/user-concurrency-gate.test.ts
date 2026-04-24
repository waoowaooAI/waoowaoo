import { describe, expect, it } from 'vitest'
import { withUserConcurrencyGate } from '@/lib/workers/user-concurrency-gate'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('user concurrency gate', () => {
  it('serializes same-scope work for the same user when limit is 1', async () => {
    const firstDone = deferred<void>()
    const events: string[] = []

    const first = withUserConcurrencyGate({
      scope: 'image',
      userId: 'user-1',
      limit: 1,
      run: async () => {
        events.push('first:start')
        await firstDone.promise
        events.push('first:end')
      },
    })

    const second = withUserConcurrencyGate({
      scope: 'image',
      userId: 'user-1',
      limit: 1,
      run: async () => {
        events.push('second:start')
        events.push('second:end')
      },
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    firstDone.resolve()
    await Promise.all([first, second])

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  it('allows different users and scopes to run concurrently under independent limits', async () => {
    const imageDone = deferred<void>()
    const events: string[] = []

    const firstImage = withUserConcurrencyGate({
      scope: 'image',
      userId: 'user-1',
      limit: 1,
      run: async () => {
        events.push('user-1:image:start')
        await imageDone.promise
        events.push('user-1:image:end')
      },
    })

    const sameUserVideo = withUserConcurrencyGate({
      scope: 'video',
      userId: 'user-1',
      limit: 1,
      run: async () => {
        events.push('user-1:video:start')
        events.push('user-1:video:end')
      },
    })

    const otherUserImage = withUserConcurrencyGate({
      scope: 'image',
      userId: 'user-2',
      limit: 1,
      run: async () => {
        events.push('user-2:image:start')
        events.push('user-2:image:end')
      },
    })

    await Promise.resolve()

    expect(events).toEqual([
      'user-1:image:start',
      'user-1:video:start',
      'user-1:video:end',
      'user-2:image:start',
      'user-2:image:end',
    ])

    imageDone.resolve()
    await Promise.all([firstImage, sameUserVideo, otherUserImage])

    expect(events).toEqual([
      'user-1:image:start',
      'user-1:video:start',
      'user-1:video:end',
      'user-2:image:start',
      'user-2:image:end',
      'user-1:image:end',
    ])
  })

  it('rejects invalid limits instead of silently bypassing concurrency governance', async () => {
    await expect(withUserConcurrencyGate({
      scope: 'image',
      userId: 'user-1',
      limit: 0,
      run: async () => 'not-run',
    })).rejects.toThrow('WORKFLOW_CONCURRENCY_INVALID: 0')
  })
})
