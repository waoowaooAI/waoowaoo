import type OpenAI from 'openai'

function extractCompletionPartsFromContent(content: unknown): { text: string; reasoning: string } {
  if (typeof content === 'string') {
    return { text: content, reasoning: '' }
  }
  if (!Array.isArray(content)) {
    return { text: '', reasoning: '' }
  }

  let text = ''
  let reasoning = ''
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const typed = item as { type?: string; text?: string }
    if (typed.type === 'reasoning' && typed.text) {
      reasoning += typed.text
      continue
    }
    if (typed.text) {
      text += typed.text
    }
  }
  return { text, reasoning }
}

export function getCompletionParts(completion: OpenAI.Chat.Completions.ChatCompletion): {
  text: string
  reasoning: string
} {
  if (!completion?.choices?.length) {
    throw new Error('LLM 返回无效响应')
  }
  const message = completion.choices[0]?.message
  if (!message) {
    throw new Error('LLM 响应中没有消息内容')
  }
  return extractCompletionPartsFromContent(message.content)
}
