/**
 * 火山引擎 Ark LLM (Responses API) 封装
 */

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
    if (!node) return
    if (typeof node === 'string') return
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
    const promptTokens = toNumber(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens)
    const completionTokens = toNumber(usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens)
    return {
        promptTokens,
        completionTokens
    }
}

export async function arkResponsesCompletion(options: ArkResponsesOptions): Promise<ArkResponsesResult> {
    if (!options.apiKey) {
        throw new Error('请配置火山引擎 API Key')
    }

    const thinking = options.thinking
        ? {
            type: options.thinking.type,
        }
        : undefined

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${options.apiKey}`
        },
        body: JSON.stringify({
            model: options.model,
            input: options.input,
            ...(thinking && { thinking })
        })
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
        raw: data
    }
}

// ============================================================
// 消息格式转换：OpenAI messages → Responses API input
// ============================================================

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }

interface ArkResponsesInputItem {
    role: string
    content: Array<{ type: string; text: string }>
}

/**
 * 将 OpenAI 格式的 messages 转为 Responses API 的 input 格式。
 * system 消息合并到第一条 user 消息前面（Responses API 用 instructions 传递系统提示，
 * 这里简化为注入到首条 user 消息）。
 */
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

        // 把 system 消息注入到首条 user 消息前
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

    // 如果只有 system 消息没有 user 消息
    if (systemParts.length > 0) {
        input.unshift({
            role: 'user',
            content: [{ type: 'input_text', text: systemParts.join('\n') }],
        })
    }

    return input
}

// ============================================================
// thinking 参数构建
// ============================================================

export function buildArkThinkingParam(
    _modelId: string,
    reasoning: boolean,
): { thinking: { type: 'enabled' | 'disabled' } } {
    // Ark Responses 对 reasoning_effort 的模型支持在实际环境存在不一致。
    // 为避免请求参数不兼容导致 400，统一仅发送 thinking.type。
    return { thinking: { type: reasoning ? 'enabled' : 'disabled' } }
}

// ============================================================
// 流式 Responses API
// ============================================================

export interface ArkStreamDelta {
    kind: 'reasoning' | 'text'
    delta: string
}

export interface ArkStreamResult {
    text: string
    reasoning: string
    usage: { promptTokens: number; completionTokens: number }
}

/**
 * 流式调用 Responses API，返回 AsyncIterable<ArkStreamDelta> + 最终结果 Promise。
 */
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

    const thinking = options.thinking
        ? {
            type: options.thinking.type,
        }
        : undefined

    const body: Record<string, unknown> = {
        model: options.model,
        input: options.input,
        stream: true,
        ...(thinking && { thinking }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
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
            const err = new Error(`Ark Responses 调用失败: ${response.status} - ${errorText}`)
            rejectResult(err)
            throw err
        }

        if (!response.body) {
            const err = new Error('Ark Responses: response body is null')
            rejectResult(err)
            throw err
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let text = ''
        let reasoning = ''
        let usage = { promptTokens: 0, completionTokens: 0 }

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })

                const parts = buffer.split('\n\n')
                buffer = parts.pop() || ''

                for (const part of parts) {
                    const dataLine = part.split('\n').find(line => line.startsWith('data: '))
                    if (!dataLine) continue

                    const jsonStr = dataLine.slice(6)
                    let event: Record<string, unknown>
                    try {
                        event = JSON.parse(jsonStr) as Record<string, unknown>
                    } catch {
                        continue
                    }

                    const eventType = event.type as string

                    if (eventType === 'response.reasoning_summary_text.delta') {
                        const delta = event.delta as string
                        if (delta) {
                            reasoning += delta
                            yield { kind: 'reasoning', delta }
                        }
                    }

                    if (eventType === 'response.output_text.delta') {
                        const delta = event.delta as string
                        if (delta) {
                            text += delta
                            yield { kind: 'text', delta }
                        }
                    }

                    if (eventType === 'response.completed') {
                        const resp = event.response as Record<string, unknown> | undefined
                        if (resp) {
                            usage = extractArkUsage(resp)
                        }
                    }
                }
            }

            resolveResult({ text, reasoning, usage })
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
