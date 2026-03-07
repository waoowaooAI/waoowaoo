import type OpenAI from 'openai'
import { chatCompletion } from '@/lib/llm-client'
import type { ChatCompletionOptions } from '@/lib/llm/types'
import { setProxy } from '../../../lib/prompts/proxy'

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }

export async function runModelGatewayTextCompletion(input: {
  userId: string
  model: string
  messages: ChatMessage[]
  options?: ChatCompletionOptions
}): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  await setProxy()
  return await chatCompletion(
    input.userId,
    input.model,
    input.messages,
    input.options,
  )
}

export async function runModelGatewayVisionCompletion(input: {
  userId: string
  model: string
  prompt: string
  imageUrls: string[]
  options?: ChatCompletionOptions
}): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  await setProxy()
  const { chatCompletionWithVision } = await import('@/lib/llm-client')
  return await chatCompletionWithVision(
    input.userId,
    input.model,
    input.prompt,
    input.imageUrls,
    input.options,
  )
}
