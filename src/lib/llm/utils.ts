import type { ChatMessage } from './types'

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

export function collectTextValue(value: unknown): string {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
        return value.map((item) => collectTextValue(item)).join('')
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>
        if (typeof obj.text === 'string') return obj.text
        if (typeof obj.content === 'string') return obj.content
        if (typeof obj.delta === 'string') return obj.delta
        if (Array.isArray(obj.parts)) {
            return obj.parts.map((part) => collectTextValue(part)).join('')
        }
    }
    return ''
}

export function extractCompletionPartsFromContent(content: unknown): { text: string; reasoning: string } {
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
        const obj = part as Record<string, unknown>
        const kind = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
        const value =
            (typeof obj.text === 'string' && obj.text) ||
            (typeof obj.content === 'string' && obj.content) ||
            collectTextValue(obj.delta) ||
            collectTextValue(obj.output_text) ||
            ''
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

export function extractStreamDeltaParts(part: unknown): { textDelta: string; reasoningDelta: string } {
    const partObject =
        typeof part === 'object' && part !== null
            ? (part as {
                choices?: Array<{ delta?: Record<string, unknown> }>
                response?: {
                    output_text?: { delta?: unknown }
                    reasoning?: { delta?: unknown }
                }
            })
            : {}
    const delta = partObject.choices?.[0]?.delta || {}
    const contentParts = extractCompletionPartsFromContent(delta.content)
    const responseDelta = partObject.response?.output_text?.delta || ''
    const responseReasoning = partObject.response?.reasoning?.delta || ''
    const explicitReasoning =
        collectTextValue(delta.reasoning) ||
        collectTextValue(delta.reasoning_content) ||
        collectTextValue(delta.reasoningContent) ||
        collectTextValue(delta.thinking) ||
        collectTextValue(delta.reasoning_details) ||
        collectTextValue(responseReasoning)
    const textDelta =
        contentParts.text ||
        collectTextValue(delta.output_text) ||
        collectTextValue(delta.text) ||
        collectTextValue(responseDelta) ||
        ''
    const reasoningDelta = contentParts.reasoning || explicitReasoning || ''
    return {
        textDelta,
        reasoningDelta,
    }
}

export function getSystemPrompt(messages: ChatMessage[]) {
    const systemParts = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .filter(Boolean)
    if (systemParts.length === 0) return undefined
    return systemParts.join('\n')
}

export function getConversationMessages(messages: ChatMessage[]) {
    return messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role,
            content: m.content,
        }))
}

export function mapReasoningEffort(effort: 'minimal' | 'low' | 'medium' | 'high' | undefined) {
    if (effort === 'low' || effort === 'medium' || effort === 'high') return effort
    if (effort === 'minimal') return 'low'
    return 'high'
}

export function buildReasoningAwareContent(text: string, reasoning: string) {
    if (!reasoning) return text
    return [
        { type: 'reasoning', text: reasoning },
        { type: 'text', text },
    ]
}
