import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useStateMock,
  useRefMock,
  useCallbackMock,
  useEffectMock,
  mutateAsyncMock,
  apiFetchMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useRefMock: vi.fn((value: unknown) => ({ current: value })),
  useCallbackMock: vi.fn((fn: unknown) => fn),
  useEffectMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
  apiFetchMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: useStateMock,
    useRef: useRefMock,
    useCallback: useCallbackMock,
    useEffect: useEffectMock,
  }
})

vi.mock('@/lib/query/hooks', () => ({
  useFetchProjectVoiceStageData: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}))

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

import { useVoiceStageDataLoader } from '@/lib/project-workflow/stages/voice-stage-runtime/useVoiceStageDataLoader'
import { useVoiceRuntimeSync } from '@/lib/project-workflow/stages/voice-stage-runtime/useVoiceRuntimeSync'
import type { VoiceLine } from '@/lib/project-workflow/stages/voice-stage-runtime/types'

function buildVoiceLine(overrides: Partial<VoiceLine>): VoiceLine {
  return {
    id: 'line-1',
    lineIndex: 1,
    speaker: '旁白',
    content: '测试台词',
    emotionPrompt: null,
    emotionStrength: null,
    audioUrl: null,
    updatedAt: '2026-03-07T12:00:00.000Z',
    lineTaskRunning: false,
    ...overrides,
  }
}

describe('useVoiceStageDataLoader', () => {
  beforeEach(() => {
    useStateMock.mockReset()
    useRefMock.mockClear()
    useCallbackMock.mockClear()
    useEffectMock.mockClear()
    mutateAsyncMock.mockReset()
    apiFetchMock.mockReset()
  })

  it('keeps background reloads from re-entering blocking loading state', async () => {
    const setVoiceLines = vi.fn()
    const setSpeakerVoices = vi.fn()
    const setProjectSpeakers = vi.fn()
    const setLoading = vi.fn()

    useStateMock
      .mockImplementationOnce(() => [[], setVoiceLines])
      .mockImplementationOnce(() => [{}, setSpeakerVoices])
      .mockImplementationOnce(() => [[], setProjectSpeakers])
      .mockImplementationOnce(() => [true, setLoading])

    mutateAsyncMock
      .mockResolvedValueOnce({
        voiceLines: [{ id: 'line-1' }],
        speakerVoices: { Narrator: { voiceType: 'uploaded', voiceId: 'voice-1' } },
        speakers: ['Narrator'],
      })
      .mockResolvedValueOnce({
        voiceLines: [{ id: 'line-1' }],
        speakerVoices: { Narrator: { voiceType: 'uploaded', voiceId: 'voice-2' } },
        speakers: ['Narrator'],
      })

    const hook = useVoiceStageDataLoader({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    await hook.loadData()
    await hook.loadData()

    expect(
      setLoading.mock.calls.filter(([value]) => value === true),
    ).toHaveLength(1)
    expect(
      setLoading.mock.calls.filter(([value]) => value === false),
    ).toHaveLength(2)
    expect(setVoiceLines).toHaveBeenNthCalledWith(1, [{ id: 'line-1' }])
    expect(setVoiceLines).toHaveBeenNthCalledWith(2, [{ id: 'line-1' }])
    expect(mutateAsyncMock).toHaveBeenNthCalledWith(1, { episodeId: 'episode-1' })
    expect(mutateAsyncMock).toHaveBeenNthCalledWith(2, { episodeId: 'episode-1' })
  })
})

describe('useVoiceRuntimeSync', () => {
  beforeEach(() => {
    useEffectMock.mockReset()
    useRefMock.mockReset()
    apiFetchMock.mockReset()
    useRefMock.mockImplementation((initialValue: unknown) => ({
      current: initialValue,
    }))
  })

  it('keeps pending regeneration until the line updatedAt advances', () => {
    const loadData = vi.fn(async () => undefined)
    const setPendingVoiceGenerationByLineId = vi.fn()
    const effectCallbacks: Array<() => void | (() => void)> = []

    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      effectCallbacks.push(callback)
    })

    const pendingGeneration = {
      'line-1': {
        submittedUpdatedAt: '2026-03-07T12:00:00.000Z',
        startedAt: '2026-03-07T11:59:59.000Z',
        taskId: 'task-1',
        taskStatus: 'completed' as const,
        taskErrorMessage: null,
      },
    }

    useVoiceRuntimeSync({
      loadData,
      voiceLines: [buildVoiceLine({
        audioUrl: '/m/voice-old.wav',
        updatedAt: '2026-03-07T12:00:00.000Z',
      })],
      activeVoiceTaskLineIds: new Set(),
      pendingVoiceGenerationByLineId: pendingGeneration,
      setPendingVoiceGenerationByLineId,
    })

    const firstRenderEffects = effectCallbacks.splice(0)
    firstRenderEffects[2]?.()

    const keepPendingUpdater = setPendingVoiceGenerationByLineId.mock.calls[0]?.[0] as
      | ((prev: typeof pendingGeneration) => typeof pendingGeneration)
      | undefined
    expect(keepPendingUpdater?.(pendingGeneration)).toBe(pendingGeneration)

    useVoiceRuntimeSync({
      loadData,
      voiceLines: [buildVoiceLine({
        audioUrl: '/m/voice-new.wav',
        updatedAt: '2026-03-07T12:00:03.000Z',
      })],
      activeVoiceTaskLineIds: new Set(),
      pendingVoiceGenerationByLineId: pendingGeneration,
      setPendingVoiceGenerationByLineId,
    })

    const secondRenderEffects = effectCallbacks.splice(0)
    secondRenderEffects[2]?.()

    const settleUpdater = setPendingVoiceGenerationByLineId.mock.calls[1]?.[0] as
      | ((prev: typeof pendingGeneration) => Record<string, never>)
      | undefined
    expect(settleUpdater?.(pendingGeneration)).toEqual({})
  })

  it('polls task status for pending generations with task ids', async () => {
    const loadData = vi.fn(async () => undefined)
    const setPendingVoiceGenerationByLineId = vi.fn()
    const effectCallbacks: Array<() => void | (() => void)> = []
    const windowStub = {
      setInterval: vi.fn(() => 123 as unknown as number),
      clearInterval: vi.fn(),
    }
    vi.stubGlobal('window', windowStub)
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        task: {
          status: 'processing',
          errorMessage: null,
        },
      }),
    })

    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      effectCallbacks.push(callback)
    })

    useVoiceRuntimeSync({
      loadData,
      voiceLines: [buildVoiceLine({
        audioUrl: '/m/voice-old.wav',
        updatedAt: '2026-03-07T12:00:00.000Z',
      })],
      activeVoiceTaskLineIds: new Set(),
      pendingVoiceGenerationByLineId: {
        'line-1': {
          submittedUpdatedAt: '2026-03-07T12:00:00.000Z',
          startedAt: '2026-03-07T12:24:10.000Z',
          taskId: 'task-1',
          taskStatus: 'queued',
          taskErrorMessage: null,
        },
      },
      setPendingVoiceGenerationByLineId,
    })

    const renderEffects = effectCallbacks.splice(0)
    const cleanup = renderEffects[3]?.()

    await Promise.resolve()

    expect(apiFetchMock).toHaveBeenCalledWith('/api/tasks/task-1', {
      method: 'GET',
      cache: 'no-store',
    })
    expect(windowStub.setInterval).toHaveBeenCalledWith(expect.any(Function), 1200)

    cleanup?.()
    expect(windowStub.clearInterval).toHaveBeenCalledWith(123)
    vi.unstubAllGlobals()
  })

  it('notifies task failure with backend error message', () => {
    const loadData = vi.fn(async () => undefined)
    const setPendingVoiceGenerationByLineId = vi.fn()
    const onTaskFailure = vi.fn()
    const effectCallbacks: Array<() => void | (() => void)> = []

    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      effectCallbacks.push(callback)
    })

    useVoiceRuntimeSync({
      loadData,
      voiceLines: [buildVoiceLine({
        audioUrl: '/m/voice-old.wav',
        updatedAt: '2026-03-07T12:00:00.000Z',
      })],
      activeVoiceTaskLineIds: new Set(),
      pendingVoiceGenerationByLineId: {
        'line-1': {
          submittedUpdatedAt: '2026-03-07T12:00:00.000Z',
          startedAt: '2026-03-07T12:24:10.000Z',
          taskId: 'task-1',
          taskStatus: 'failed',
          taskErrorMessage: 'backend failed',
        },
      },
      setPendingVoiceGenerationByLineId,
      onTaskFailure,
    })

    const renderEffects = effectCallbacks.splice(0)
    renderEffects[1]?.()

    expect(onTaskFailure).toHaveBeenCalledWith({
      lineId: 'line-1',
      line: expect.objectContaining({ id: 'line-1' }),
      taskId: 'task-1',
      errorMessage: 'backend failed',
    })
  })
})
