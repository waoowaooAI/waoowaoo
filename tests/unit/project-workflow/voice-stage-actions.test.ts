import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useStateMock,
  useCallbackMock,
  useQueryClientMock,
  upsertTaskTargetOverlayMock,
  logErrorMock,
  refreshAssetsMock,
  updateVoiceSettingsMutateAsyncMock,
  saveDesignedVoiceMutateAsyncMock,
  setVoiceDesignCharacterMock,
  requestJsonWithErrorMock,
  useMutationMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useCallbackMock: vi.fn((fn: unknown) => fn),
  useQueryClientMock: vi.fn(() => ({ id: 'query-client', invalidateQueries: vi.fn() })),
  upsertTaskTargetOverlayMock: vi.fn(),
  logErrorMock: vi.fn(),
  refreshAssetsMock: vi.fn(),
  updateVoiceSettingsMutateAsyncMock: vi.fn(),
  saveDesignedVoiceMutateAsyncMock: vi.fn(),
  setVoiceDesignCharacterMock: vi.fn(),
  requestJsonWithErrorMock: vi.fn(),
  useMutationMock: vi.fn((options: unknown) => options),
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
  useMutation: (options: unknown) => useMutationMock(options),
}))

vi.mock('@/lib/query/task-target-overlay', () => ({
  upsertTaskTargetOverlay: (...args: unknown[]) => upsertTaskTargetOverlayMock(...args),
}))

vi.mock('@/lib/logging/core', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'tts.voiceDesignSaved') {
      return `voice saved:${String(values?.name ?? '')}`
    }
    if (key === 'tts.saveVoiceDesignFailed') {
      return `save failed:${String(values?.error ?? '')}`
    }
    if (key === 'common.unknownError') {
      return 'unknown error'
    }
    return key
  },
}))

vi.mock('@/lib/query/hooks', () => ({
  useProjectAssets: () => ({
    data: {
      characters: [{
        id: 'character-1',
        name: 'Hero',
        customVoiceUrl: null,
      }],
    },
  }),
  useRefreshProjectAssets: () => refreshAssetsMock,
  useUpdateProjectCharacterVoiceSettings: () => ({
    mutateAsync: updateVoiceSettingsMutateAsyncMock,
  }),
  useSaveProjectDesignedVoice: () => ({
    mutateAsync: saveDesignedVoiceMutateAsyncMock,
  }),
}))

vi.mock('@/lib/query/mutations/mutation-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/mutation-shared')>(
    '@/lib/query/mutations/mutation-shared',
  )
  return {
    ...actual,
    invalidateQueryTemplates: vi.fn(),
    requestJsonWithError: requestJsonWithErrorMock,
  }
})

import { useVoiceGenerationActions } from '@/lib/project-workflow/stages/voice-stage-runtime/useVoiceGenerationActions'
import { useUpdateProjectCharacterVoiceSettings } from '@/lib/query/mutations/character-voice-mutations'
import { useTTSGeneration } from '@/features/project-workspace/components/assets/hooks/useTTSGeneration'

interface UpdateVoiceMutation {
  mutationFn: (variables: {
    characterId: string
    voiceType: 'qwen-designed' | 'uploaded' | 'custom' | null
    voiceId?: string
    customVoiceUrl?: string
  }) => Promise<unknown>
}

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
      { id: 'query-client', invalidateQueries: expect.any(Function) },
      {
        projectId: 'project-1',
        targetType: 'ProjectVoiceLine',
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

describe('project character voice mutations', () => {
  beforeEach(() => {
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
    requestJsonWithErrorMock.mockReset()
    requestJsonWithErrorMock.mockResolvedValue({ success: true })
  })

  it('routes voice setting updates to the character-voice endpoint after designed voice save', async () => {
    const mutation = useUpdateProjectCharacterVoiceSettings('project-1') as unknown as UpdateVoiceMutation

    await mutation.mutationFn({
      characterId: 'character-1',
      voiceType: 'qwen-designed',
      voiceId: 'voice-1',
      customVoiceUrl: 'https://example.com/audio.wav',
    })

    expect(requestJsonWithErrorMock).toHaveBeenCalledTimes(1)
    expect(requestJsonWithErrorMock).toHaveBeenCalledWith(
      '/api/assets/character-1',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          kind: 'character',
          projectId: 'project-1',
          voiceType: 'qwen-designed',
          voiceId: 'voice-1',
          customVoiceUrl: 'https://example.com/audio.wav',
        }),
      },
      '更新音色失败',
    )
  })
})

describe('useTTSGeneration', () => {
  const originalAlert = globalThis.alert

  beforeEach(() => {
    useStateMock.mockReset()
    logErrorMock.mockReset()
    refreshAssetsMock.mockReset()
    updateVoiceSettingsMutateAsyncMock.mockReset()
    saveDesignedVoiceMutateAsyncMock.mockReset()
    setVoiceDesignCharacterMock.mockReset()
    saveDesignedVoiceMutateAsyncMock.mockResolvedValue({
      success: true,
      audioUrl: 'https://signed.example.com/audio.wav',
    })
    globalThis.alert = vi.fn()
    useStateMock.mockReturnValue([
      {
        id: 'character-1',
        name: 'Hero',
        hasExistingVoice: false,
      },
      setVoiceDesignCharacterMock,
    ])
  })

  afterEach(() => {
    globalThis.alert = originalAlert
  })

  it('does not send a second voice update request after designed voice save succeeds', async () => {
    const hook = useTTSGeneration({ projectId: 'project-1' })

    await hook.handleVoiceDesignSave('voice-1', 'base64-audio')

    expect(saveDesignedVoiceMutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(saveDesignedVoiceMutateAsyncMock).toHaveBeenCalledWith({
      characterId: 'character-1',
      voiceId: 'voice-1',
      audioBase64: 'base64-audio',
    })
    expect(updateVoiceSettingsMutateAsyncMock).not.toHaveBeenCalled()
    expect(refreshAssetsMock).toHaveBeenCalledTimes(1)
    expect(globalThis.alert).toHaveBeenCalledWith('voice saved:Hero')
    expect(setVoiceDesignCharacterMock).toHaveBeenCalledWith(null)
  })
})
