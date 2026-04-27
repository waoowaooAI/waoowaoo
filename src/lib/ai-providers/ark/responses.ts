export interface ArkResponsesOptions {
  apiKey: string
  model: string
  input: unknown[]
  thinking?: {
    type: 'enabled' | 'disabled'
  }
}

export interface ArkResponsesResult {
  text: string
  reasoning: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
  raw: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function collectText(node: unknown, acc: string[]) {
  if (!node) return
  if (typeof node === 'string') {
    acc.push(node)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectText(item, acc))
    return
  }
  const obj = asRecord(node)
  if (!obj) return
  const type = typeof obj.type === 'string' ? obj.type : undefined
  if (type === 'reasoning' || type === 'function_call') return
  if (typeof obj.output_text === 'string') acc.push(obj.output_text)
  if (typeof obj.text === 'string' && type !== 'reasoning') acc.push(obj.text)
  if (typeof obj.content === 'string') acc.push(obj.content)
  if (obj.content && typeof obj.content !== 'string') collectText(obj.content, acc)
  if (typeof obj.message === 'string') acc.push(obj.message)
  if (obj.message && typeof obj.message !== 'string') collectText(obj.message, acc)
}

function collectReasoning(node: unknown, acc: string[]) {
  if (!node || typeof node === 'string') return
  if (Array.isArray(node)) {
    node.forEach((item) => collectReasoning(item, acc))
    return
  }
  const obj = asRecord(node)
  if (!obj) return
  const type = typeof obj.type === 'string' ? obj.type : undefined
  const isReasoning = type === 'reasoning' || type === 'reasoning_content'
  if (isReasoning) {
    if (typeof obj.text === 'string') acc.push(obj.text)
    if (typeof obj.content === 'string') acc.push(obj.content)
    if (obj.content && typeof obj.content !== 'string') collectReasoning(obj.content, acc)
  }
  if (obj.reasoning) collectReasoning(obj.reasoning, acc)
  if (obj.reasoning_content) collectReasoning(obj.reasoning_content, acc)
  if (obj.thinking) collectReasoning(obj.thinking, acc)
}

function extractArkText(data: unknown): string {
  const obj = asRecord(data)
  if (!obj) return ''
  if (typeof obj.output_text === 'string') return obj.output_text
  const output = obj.output ?? obj.outputs ?? []
  const acc: string[] = []
  collectText(output, acc)
  return acc.filter(Boolean).join('')
}

function extractArkReasoning(data: unknown): string {
  const obj = asRecord(data)
  if (!obj) return ''
  const output = obj.output ?? obj.outputs ?? []
  const acc: string[] = []
  collectReasoning(output, acc)
  return acc.filter(Boolean).join('')
}

function extractArkUsage(data: unknown): { promptTokens: number; completionTokens: number } {
  const usage = asRecord(asRecord(data)?.usage) || {}
  const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return {
    promptTokens: toNumber(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens),
    completionTokens: toNumber(usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens),
  }
}

export async function arkResponsesCompletion(options: ArkResponsesOptions): Promise<ArkResponsesResult> {
  if (!options.apiKey) throw new Error('请配置火山引擎 API Key')
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      input: options.input,
      ...(options.thinking ? { thinking: { type: options.thinking.type } } : {}),
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ark Responses 调用失败: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  return {
    text: extractArkText(data),
    reasoning: extractArkReasoning(data),
    usage: extractArkUsage(data),
    raw: data,
  }
}

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }
interface ArkResponsesInputItem {
  role: string
  content: Array<{ type: string; text: string }>
}

export function convertChatMessagesToArkInput(messages: ChatMessage[]): ArkResponsesInputItem[] {
  const systemParts: string[] = []
  const input: ArkResponsesInputItem[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content)
      continue
    }
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    const contentItems: Array<{ type: string; text: string }> = []
    if (role === 'user' && systemParts.length > 0 && input.length === 0) {
      contentItems.push({ type: 'input_text', text: systemParts.join('\n') })
      systemParts.length = 0
    }
    contentItems.push({
      type: role === 'assistant' ? 'output_text' : 'input_text',
      text: msg.content,
    })
    input.push({ role, content: contentItems })
  }
  if (systemParts.length > 0) {
    input.unshift({
      role: 'user',
      content: [{ type: 'input_text', text: systemParts.join('\n') }],
    })
  }
  return input
}

export function buildArkThinkingParam(
  _modelId: string,
  reasoning: boolean,
): { thinking: { type: 'enabled' | 'disabled' } } {
  return { thinking: { type: reasoning ? 'enabled' : 'disabled' } }
}

export interface ArkStreamDelta {
  kind: 'reasoning' | 'text'
  delta: string
}

export interface ArkStreamResult {
  text: string
  reasoning: string
  usage: { promptTokens: number; completionTokens: number }
}

export function arkResponsesStream(options: ArkResponsesOptions & { temperature?: number }): {
  stream: AsyncIterable<ArkStreamDelta>
  result: () => Promise<ArkStreamResult>
} {
  let resolveResult!: (value: ArkStreamResult) => void
  let rejectResult!: (error: Error) => void
  const resultPromise = new Promise<ArkStreamResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const body: Record<string, unknown> = {
    model: options.model,
    input: options.input,
    stream: true,
    ...(options.thinking ? { thinking: { type: options.thinking.type } } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  }

  async function* generateStream(): AsyncIterable<ArkStreamDelta> {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const errorText = await response.text()
      const error = new Error(`Ark Responses 调用失败: ${response.status} - ${errorText}`)
      rejectResult(error)
      throw error
    }
    const reader = response.body?.getReader()
    if (!reader) {
      const error = new Error('ARK_STREAM_BODY_MISSING')
      rejectResult(error)
      throw error
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    let finalReasoning = ''
    let finalUsage = { promptTokens: 0, completionTokens: 0 }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          const parsed = JSON.parse(data) as Record<string, unknown>
          finalText = extractArkText(parsed) || finalText
          finalReasoning = extractArkReasoning(parsed) || finalReasoning
          finalUsage = extractArkUsage(parsed)
          const deltaText = extractArkText(parsed)
          const deltaReasoning = extractArkReasoning(parsed)
          if (deltaReasoning) yield { kind: 'reasoning', delta: deltaReasoning }
          if (deltaText) yield { kind: 'text', delta: deltaText }
        }
      }
      resolveResult({
        text: finalText,
        reasoning: finalReasoning,
        usage: finalUsage,
      })
    } catch (error) {
      rejectResult(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  return {
    stream: generateStream(),
    result: () => resultPromise,
  }
}
