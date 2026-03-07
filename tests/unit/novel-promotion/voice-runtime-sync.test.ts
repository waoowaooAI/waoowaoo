import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useEffectMock, useRefMock } = vi.hoisted(() => ({
  useEffectMock: vi.fn(),
  useRefMock: vi.fn(),
}))

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useEffect: useEffectMock,
    useRef: useRefMock,
  }
})

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

import { useVoiceRuntimeSync } from '@/lib/novel-promotion/stages/voice-stage-runtime/useVoiceRuntimeSync'
import type { VoiceLine } from '@/lib/novel-promotion/stages/voice-stage-runtime/types'

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
        id: 'line-9',
        lineIndex: 9,
      })],
      activeVoiceTaskLineIds: new Set(),
      pendingVoiceGenerationByLineId: {
        'line-9': {
          submittedUpdatedAt: '2026-03-07T12:00:00.000Z',
          startedAt: '2026-03-07T12:24:10.000Z',
          taskId: 'task-failed-1',
          taskStatus: 'failed',
          taskErrorMessage: 'QwenTTS voiceId missing',
        },
      },
      setPendingVoiceGenerationByLineId,
      onTaskFailure,
    })

    const renderEffects = effectCallbacks.splice(0)
    renderEffects[1]?.()

    expect(onTaskFailure).toHaveBeenCalledWith({
      lineId: 'line-9',
      line: expect.objectContaining({
        id: 'line-9',
        lineIndex: 9,
      }),
      taskId: 'task-failed-1',
      errorMessage: 'QwenTTS voiceId missing',
    })
  })
})
