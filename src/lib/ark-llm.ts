/**
 * 火山引擎 Ark LLM (Responses API) 封装
 */

export interface ArkResponsesOptions {
    apiKey: string
    model: string
    input: unknown[]
    thinking?: {
        type: 'enabled' | 'disabled'
        reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high'
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
            ...(options.thinking.reasoning_effort ? { reasoning_effort: options.thinking.reasoning_effort } : {}),
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
