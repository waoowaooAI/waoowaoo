import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useStateMock,
  useRefMock,
  useCallbackMock,
  useEffectMock,
  mutateAsyncMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useRefMock: vi.fn((value: unknown) => ({ current: value })),
  useCallbackMock: vi.fn((fn: unknown) => fn),
  useEffectMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
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

import { useVoiceStageDataLoader } from '@/lib/novel-promotion/stages/voice-stage-runtime/useVoiceStageDataLoader'

describe('useVoiceStageDataLoader', () => {
  beforeEach(() => {
    useStateMock.mockReset()
    useRefMock.mockClear()
    useCallbackMock.mockClear()
    useEffectMock.mockClear()
    mutateAsyncMock.mockReset()
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
