import { beforeEach, describe, expect, it, vi } from 'vitest'

const textCompletion = {
  id: 'text-completion',
  choices: [{ message: { content: 'text-ok' } }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
}
const visionCompletion = {
  id: 'vision-completion',
  choices: [{ message: { content: 'vision-ok' } }],
  usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
}

const runChatCompletionMock = vi.hoisted(() => vi.fn(async () => textCompletion))
const runChatCompletionWithVisionMock = vi.hoisted(() => vi.fn(async () => visionCompletion))

vi.mock('@/lib/ai-exec/llm/completion-runner', () => ({
  runChatCompletion: runChatCompletionMock,
  chatCompletionStream: vi.fn(),
}))

vi.mock('@/lib/ai-exec/llm/vision-runner', () => ({
  runChatCompletionWithVision: runChatCompletionWithVisionMock,
  runChatCompletionWithVisionStream: vi.fn(),
}))

import { executeAiTextStep, executeAiVisionStep } from '@/lib/ai-exec/engine'

describe('ai-exec engine llm wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates text completion to ai-exec chatCompletion', async () => {
    const result = await executeAiTextStep({
      userId: 'user-1',
      model: 'openai-compatible::gpt-image-1',
      messages: [{ role: 'user', content: 'hello' }],
      action: 'unit_text',
      meta: {
        stepId: 'step-1',
        stepTitle: 'Step 1',
        stepIndex: 1,
        stepTotal: 1,
      },
      temperature: 0.2,
    })

    expect(runChatCompletionMock).toHaveBeenCalledTimes(1)
    expect(runChatCompletionMock).toHaveBeenCalledWith(
      'user-1',
      'openai-compatible::gpt-image-1',
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({ temperature: 0.2, action: 'unit_text' }),
    )
    expect(result.text).toBe('text-ok')
    expect(result.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 })
  })

  it('delegates vision completion to ai-exec chatCompletionWithVision', async () => {
    const result = await executeAiVisionStep({
      userId: 'user-1',
      model: 'google::gemini-3-pro',
      prompt: 'analyze image',
      imageUrls: ['https://example.com/a.png'],
      action: 'unit_vision',
      temperature: 0.4,
    })

    expect(runChatCompletionWithVisionMock).toHaveBeenCalledTimes(1)
    expect(runChatCompletionWithVisionMock).toHaveBeenCalledWith(
      'user-1',
      'google::gemini-3-pro',
      'analyze image',
      ['https://example.com/a.png'],
      expect.objectContaining({ temperature: 0.4, action: 'unit_vision' }),
    )
    expect(result.text).toBe('vision-ok')
    expect(result.usage).toEqual({ promptTokens: 4, completionTokens: 5, totalTokens: 9 })
  })
})
