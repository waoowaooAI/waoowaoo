import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useStateMock,
  logErrorMock,
  refreshAssetsMock,
  updateVoiceSettingsMutateAsyncMock,
  saveDesignedVoiceMutateAsyncMock,
  setVoiceDesignCharacterMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  logErrorMock: vi.fn(),
  refreshAssetsMock: vi.fn(),
  updateVoiceSettingsMutateAsyncMock: vi.fn(),
  saveDesignedVoiceMutateAsyncMock: vi.fn(),
  setVoiceDesignCharacterMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: useStateMock,
  }
})

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

vi.mock('@/lib/logging/core', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
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

import { useTTSGeneration } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/assets/hooks/useTTSGeneration'

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
