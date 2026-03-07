import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useStateMock,
  useCallbackMock,
  useQueryClientMock,
  upsertTaskTargetOverlayMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useCallbackMock: vi.fn((fn: unknown) => fn),
  useQueryClientMock: vi.fn(() => ({ id: 'query-client' })),
  upsertTaskTargetOverlayMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: useStateMock,
    useCallback: useCallbackMock,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => useQueryClientMock(),
}))

vi.mock('@/lib/query/task-target-overlay', () => ({
  upsertTaskTargetOverlay: (...args: unknown[]) => upsertTaskTargetOverlayMock(...args),
}))

import { useVoiceGenerationActions } from '@/lib/novel-promotion/stages/voice-stage-runtime/useVoiceGenerationActions'

describe('useVoiceGenerationActions', () => {
  beforeEach(() => {
    useStateMock.mockReset()
    useCallbackMock.mockClear()
    useQueryClientMock.mockClear()
    upsertTaskTargetOverlayMock.mockReset()

    useStateMock
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
  })

  it('adds an optimistic task overlay for async single-line generation', async () => {
    const setPendingVoiceGenerationByLineId = vi.fn()
    const notifyVoiceLinesChanged = vi.fn()
    const generateVoiceMutation = {
      mutateAsync: vi.fn(async () => ({
        success: true,
        async: true,
        taskId: 'task-voice-1',
      })),
    }

    const runtime = useVoiceGenerationActions({
      projectId: 'project-1',
      episodeId: 'episode-1',
      t: (key: string) => key,
      voiceLines: [],
      linesWithAudio: 0,
      speakerCharacterMap: {},
      speakerVoices: {},
      analyzeVoiceMutation: { mutateAsync: vi.fn() },
      generateVoiceMutation,
      downloadVoicesMutation: { mutateAsync: vi.fn() },
      loadData: vi.fn(),
      notifyVoiceLinesChanged,
      setPendingVoiceGenerationByLineId,
    })

    await runtime.handleGenerateLine('line-1')

    expect(upsertTaskTargetOverlayMock).toHaveBeenCalledWith(
      { id: 'query-client' },
      {
        projectId: 'project-1',
        targetType: 'NovelPromotionVoiceLine',
        targetId: 'line-1',
        phase: 'queued',
        runningTaskId: 'task-voice-1',
        runningTaskType: 'voice_line',
        intent: 'generate',
        hasOutputAtStart: false,
      },
    )
    expect(notifyVoiceLinesChanged).toHaveBeenCalledTimes(1)
    expect(setPendingVoiceGenerationByLineId).toHaveBeenCalledTimes(2)
  })
})
