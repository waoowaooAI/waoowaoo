import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserModelConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({ analysisModel: null })),
)

vi.mock('@/lib/config-service', () => ({
  getUserModelConfig: getUserModelConfigMock,
}))

import { AssistantPlatformError } from '@/lib/assistant-platform'
import { createAssistantChatResponse } from '@/lib/assistant-platform/runtime'

describe('assistant-platform runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws invalid request when messages payload is malformed', async () => {
    await expect(createAssistantChatResponse({
      userId: 'user-1',
      assistantId: 'api-config-template',
      context: {},
      messages: { invalid: true },
    })).rejects.toMatchObject({
      code: 'ASSISTANT_INVALID_REQUEST',
    } as Partial<AssistantPlatformError>)
  })

  it('throws missing model when analysisModel is not configured', async () => {
    await expect(createAssistantChatResponse({
      userId: 'user-1',
      assistantId: 'api-config-template',
      context: {
        providerId: 'openai-compatible:oa-1',
      },
      messages: [{
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      }],
    })).rejects.toMatchObject({
      code: 'ASSISTANT_MODEL_NOT_CONFIGURED',
    } as Partial<AssistantPlatformError>)
  })
})
