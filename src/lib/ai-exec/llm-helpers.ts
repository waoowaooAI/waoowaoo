import type OpenAI from 'openai'

import {
  chatCompletion,
  chatCompletionStream,
  chatCompletionWithVision,
  chatCompletionWithVisionStream,
} from '@/lib/ai-exec/engine'

export {
  chatCompletion,
  chatCompletionStream,
  chatCompletionWithVision,
  chatCompletionWithVisionStream,
}

function splitThinkTaggedContent(input: string): { text: string; reasoning: string } {
  const thinkTagPattern = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const reasoningParts: string[] = []
  let matched = false

  const stripped = input.replace(thinkTagPattern, (_fullMatch, _tagName: string, inner: string) => {
    matched = true
    const trimmed = inner.trim()
    if (trimmed) reasoningParts.push(trimmed)
    return ''
  })

  if (!matched) {
    return {
      text: input,
      reasoning: '',
    }
  }

  return {
    text: stripped.trim(),
    reasoning: reasoningParts.join('\n\n').trim(),
  }
}

type TextCarrierObject = {
  text?: unknown
  content?: unknown
  delta?: unknown
  parts?: unknown
}

function collectTextValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => collectTextValue(item)).join('')
  if (typeof value === 'object') {
    const obj = value as TextCarrierObject
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.delta === 'string') return obj.delta
    if (Array.isArray(obj.parts)) return obj.parts.map((part) => collectTextValue(part)).join('')
  }
  return ''
}

type CompletionContentPart = {
  type?: unknown
  text?: unknown
  content?: unknown
  delta?: unknown
  output_text?: unknown
}

function extractCompletionPartsFromContent(content: unknown): { text: string; reasoning: string } {
  if (typeof content === 'string') {
    return splitThinkTaggedContent(content)
  }
  if (!Array.isArray(content)) {
    return splitThinkTaggedContent(collectTextValue(content))
  }

  let text = ''
  let reasoning = ''
  for (const part of content) {
    if (typeof part === 'string') {
      text += part
      continue
    }
    if (!part || typeof part !== 'object') continue
    const obj = part as CompletionContentPart
    const kind = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
    const value =
      (typeof obj.text === 'string' && obj.text)
      || (typeof obj.content === 'string' && obj.content)
      || collectTextValue(obj.delta)
      || collectTextValue(obj.output_text)
      || ''
    if (!value) continue
    if (kind.includes('reason') || kind.includes('think')) {
      reasoning += value
    } else {
      const parsed = splitThinkTaggedContent(value)
      text += parsed.text
      if (parsed.reasoning) reasoning += parsed.reasoning
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

export function getCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  return getCompletionParts(completion).text
}
