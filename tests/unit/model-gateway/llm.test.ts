import { beforeEach, describe, expect, it, vi } from 'vitest'

const chatCompletionMock = vi.hoisted(() => vi.fn(async () => ({ id: 'text-completion' })))
const chatCompletionWithVisionMock = vi.hoisted(() => vi.fn(async () => ({ id: 'vision-completion' })))

vi.mock('@/lib/llm-client', () => ({
  chatCompletion: chatCompletionMock,
  chatCompletionWithVision: chatCompletionWithVisionMock,
}))

import {
  runModelGatewayTextCompletion,
  runModelGatewayVisionCompletion,
} from '@/lib/model-gateway/llm'

describe('model-gateway llm wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates text completion to llm-client chatCompletion', async () => {
    const result = await runModelGatewayTextCompletion({
      userId: 'user-1',
      model: 'openai-compatible::gpt-image-1',
      messages: [{ role: 'user', content: 'hello' }],
      options: { temperature: 0.2 },
    })

    expect(chatCompletionMock).toHaveBeenCalledTimes(1)
    expect(chatCompletionMock).toHaveBeenCalledWith(
      'user-1',
      'openai-compatible::gpt-image-1',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
    )
    expect(result).toEqual({ id: 'text-completion' })
  })

  it('delegates vision completion to llm-client chatCompletionWithVision', async () => {
    const result = await runModelGatewayVisionCompletion({
      userId: 'user-1',
      model: 'google::gemini-3-pro',
      prompt: 'analyze image',
      imageUrls: ['https://example.com/a.png'],
      options: { temperature: 0.4 },
    })

    expect(chatCompletionWithVisionMock).toHaveBeenCalledTimes(1)
    expect(chatCompletionWithVisionMock).toHaveBeenCalledWith(
      'user-1',
      'google::gemini-3-pro',
      'analyze image',
      ['https://example.com/a.png'],
      { temperature: 0.4 },
    )
    expect(result).toEqual({ id: 'vision-completion' })
  })
})
