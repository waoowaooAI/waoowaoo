import OpenAI from 'openai'
import { extractCompletionPartsFromContent } from './utils'
import { _ulogError } from './runtime-shared'

export function getCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  return getCompletionParts(completion).text
}

export function getCompletionParts(completion: OpenAI.Chat.Completions.ChatCompletion): {
  text: string
  reasoning: string
} {
  if (!completion || !completion.choices || completion.choices.length === 0) {
    _ulogError(
      '[LLM] ❌ 返回无效响应 - 完整对象:',
      JSON.stringify(completion, null, 2).substring(0, 2000),
    )
    throw new Error('LLM 返回无效响应')
  }

  const message = completion.choices[0]?.message
  if (!message) {
    _ulogError(
      '[LLM] ❌ 响应中没有消息内容 - choices[0]:',
      JSON.stringify(completion.choices[0], null, 2).substring(0, 1000),
    )
    throw new Error('LLM 响应中没有消息内容')
  }

  const content = message.content
  return extractCompletionPartsFromContent(content)
}
