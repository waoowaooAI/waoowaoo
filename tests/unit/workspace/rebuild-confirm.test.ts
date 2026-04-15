import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useStateMock,
  useRefMock,
  useCallbackMock,
  useMemoMock,
  setShowRebuildConfirmMock,
  setRebuildConfirmContextMock,
  setPendingActionTypeMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useRefMock: vi.fn(() => ({ current: null })),
  useCallbackMock: vi.fn((fn: unknown) => fn),
  useMemoMock: vi.fn((factory: () => unknown) => factory()),
  setShowRebuildConfirmMock: vi.fn(),
  setRebuildConfirmContextMock: vi.fn(),
  setPendingActionTypeMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: useStateMock,
    useRef: useRefMock,
    useCallback: useCallbackMock,
    useMemo: useMemoMock,
  }
})

import {
  hasDownstreamStoryboardData,
  useRebuildConfirm,
} from '@/features/project-workspace/hooks/useRebuildConfirm'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useRebuildConfirm', () => {
  beforeEach(() => {
    useStateMock.mockReset()
    useRefMock.mockReset()
    useCallbackMock.mockClear()
    useMemoMock.mockClear()
    setShowRebuildConfirmMock.mockReset()
    setRebuildConfirmContextMock.mockReset()
    setPendingActionTypeMock.mockReset()

    useRefMock.mockReturnValue({ current: null })
    useStateMock
      .mockImplementationOnce(() => [false, setShowRebuildConfirmMock])
      .mockImplementationOnce(() => [null, setRebuildConfirmContextMock])
      .mockImplementationOnce(() => [null, setPendingActionTypeMock])
  })

  it('clicking story to script -> sets pending action before downstream check resolves', async () => {
    const deferred = createDeferred<{ storyboardCount: number; panelCount: number }>()
    const getProjectStoryboardStats = vi.fn(() => deferred.promise)
    const action = vi.fn(async () => undefined)

    const hook = useRebuildConfirm({
      episodeId: 'episode-1',
      episodeStoryboards: [],
      getProjectStoryboardStats,
      t: (key: string) => key,
    })

    const pendingRun = hook.runWithRebuildConfirm('storyToScript', action)

    expect(setPendingActionTypeMock).toHaveBeenCalledWith('storyToScript')
    expect(getProjectStoryboardStats).toHaveBeenCalledWith('episode-1')
    expect(action).not.toHaveBeenCalled()

    deferred.resolve({ storyboardCount: 0, panelCount: 0 })
    await pendingRun

    expect(action).toHaveBeenCalledTimes(1)
  })

  it('story to script without downstream confirm clears pending action after action completes', async () => {
    const getProjectStoryboardStats = vi.fn(async () => ({ storyboardCount: 0, panelCount: 0 }))
    const action = vi.fn(async () => undefined)

    const hook = useRebuildConfirm({
      episodeId: 'episode-1',
      episodeStoryboards: [],
      getProjectStoryboardStats,
      t: (key: string) => key,
    })

    await hook.runWithRebuildConfirm('storyToScript', action)

    expect(action).toHaveBeenCalledTimes(1)
    expect(setPendingActionTypeMock).toHaveBeenCalledTimes(2)
    expect(setPendingActionTypeMock).toHaveBeenNthCalledWith(1, 'storyToScript')

    const resetCall = setPendingActionTypeMock.mock.calls[1]?.[0]
    expect(typeof resetCall).toBe('function')
    if (typeof resetCall !== 'function') {
      throw new Error('expected reset pending action updater')
    }
    expect(resetCall('storyToScript')).toBeNull()
    expect(resetCall('scriptToStoryboard')).toBe('scriptToStoryboard')
  })
})

describe('hasDownstreamStoryboardData', () => {
  it('storyboard and panel counts are both zero -> returns false', () => {
    expect(hasDownstreamStoryboardData({ storyboardCount: 0, panelCount: 0 })).toBe(false)
  })

  it('storyboard count is greater than zero -> returns true', () => {
    expect(hasDownstreamStoryboardData({ storyboardCount: 1, panelCount: 0 })).toBe(true)
  })

  it('panel count is greater than zero -> returns true', () => {
    expect(hasDownstreamStoryboardData({ storyboardCount: 0, panelCount: 2 })).toBe(true)
  })
})
