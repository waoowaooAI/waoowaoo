import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const qwenMock = vi.hoisted(() => ({
  createVoiceDesign: vi.fn(),
  validateVoicePrompt: vi.fn(),
  validatePreviewText: vi.fn(),
}))

const apiConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/qwen-voice-design', () => qwenMock)
vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: workerMock.assertTaskActive,
}))

import { handleVoiceDesignTask } from '@/lib/workers/handlers/voice-design'

function buildJob(type: TaskJobData['type'], payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-voice-1',
      type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'VoiceDesign',
      targetId: 'voice-design-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker voice-design behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    qwenMock.validateVoicePrompt.mockReturnValue({ valid: true })
    qwenMock.validatePreviewText.mockReturnValue({ valid: true })
    apiConfigMock.getProviderConfig.mockResolvedValue({ apiKey: 'qwen-key' })
    qwenMock.createVoiceDesign.mockResolvedValue({
      success: true,
      voiceId: 'voice-id-1',
      targetModel: 'qwen-tts',
      audioBase64: 'base64-audio',
      sampleRate: 24000,
      responseFormat: 'mp3',
      usageCount: 11,
      requestId: 'req-1',
    })
  })

  it('missing required fields -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.VOICE_DESIGN, { previewText: 'hello' })
    await expect(handleVoiceDesignTask(job)).rejects.toThrow('voicePrompt is required')
  })

  it('invalid prompt validation -> explicit error message from validator', async () => {
    qwenMock.validateVoicePrompt.mockReturnValue({ valid: false, error: 'bad prompt' })

    const job = buildJob(TASK_TYPE.VOICE_DESIGN, {
      voicePrompt: 'x',
      previewText: 'hello',
    })
    await expect(handleVoiceDesignTask(job)).rejects.toThrow('bad prompt')
  })

  it('success path -> submits normalized input and returns typed result', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_VOICE_DESIGN, {
      voicePrompt: '  calm female narrator  ',
      previewText: '  hello world  ',
      preferredName: '  custom_name  ',
      language: 'en',
    })

    const result = await handleVoiceDesignTask(job)

    expect(apiConfigMock.getProviderConfig).toHaveBeenCalledWith('user-1', 'qwen')
    expect(qwenMock.createVoiceDesign).toHaveBeenCalledWith({
      voicePrompt: 'calm female narrator',
      previewText: 'hello world',
      preferredName: 'custom_name',
      language: 'en',
    }, 'qwen-key')

    expect(result).toEqual(expect.objectContaining({
      success: true,
      voiceId: 'voice-id-1',
      taskType: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
    }))
  })
})
