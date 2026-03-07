interface GoogleTextPart {
    text?: unknown
    thought?: unknown
    type?: unknown
}

interface GoogleUsageLike {
    promptTokenCount?: unknown
    prompt_tokens?: unknown
    input_tokens?: unknown
    totalTokenCount?: unknown
    total_tokens?: unknown
    candidatesTokenCount?: unknown
    completion_tokens?: unknown
    output_tokens?: unknown
}

interface GoogleResponseLike {
    candidates?: Array<{ content?: { parts?: GoogleTextPart[] }; finishReason?: unknown }>
    response?: { candidates?: Array<{ content?: { parts?: GoogleTextPart[] }; finishReason?: unknown }> }
    usageMetadata?: GoogleUsageLike
    usage?: GoogleUsageLike
}

function toNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isThoughtPart(part: GoogleTextPart): boolean {
    if (part.thought === true) return true
    if (typeof part.type === 'string') {
        const normalized = part.type.toLowerCase()
        if (normalized.includes('thought') || normalized.includes('reason')) return true
    }
    return false
}

/**
 * Google Gemini API 返回空响应错误（但不是内容安全拒绝）
 * 通常是模型内部超时或某些边缘输入触发的问题，可以重试
 */
export class GoogleEmptyResponseError extends Error {
    constructor(finishReason?: unknown) {
        const reason = finishReason ? ` (finishReason: ${String(finishReason)})` : ''
        super(`Google Gemini 返回了空文本响应${reason}，请重试`)
        this.name = 'GoogleEmptyResponseError'
    }
}

export function extractGoogleParts(response: unknown, throwOnEmpty = false): { text: string; reasoning: string } {
    if (!response || typeof response !== 'object') {
        return { text: '', reasoning: '' }
    }
    const safe = response as GoogleResponseLike
    const candidates = safe.candidates || safe.response?.candidates || []
    const firstCandidate = candidates?.[0]
    const parts = firstCandidate?.content?.parts || []
    let text = ''
    let reasoning = ''
    for (const part of parts) {
        const value = typeof part.text === 'string' ? part.text : ''
        if (!value) continue
        if (isThoughtPart(part)) {
            reasoning += value
        } else {
            text += value
        }
    }

    // 如果有 candidates 但 text 为空，说明模型返回了空响应
    // 只在 throwOnEmpty=true 时检查（用于非流式的最终响应），避免在流式 chunk 间误抛
    if (throwOnEmpty && candidates.length > 0 && !text) {
        const finishReason = firstCandidate?.finishReason
        // SAFETY 表示内容安全拒绝，不重试；其他情况抛出可重试错误
        if (finishReason !== 'SAFETY' && finishReason !== 'PROHIBITED_CONTENT') {
            throw new GoogleEmptyResponseError(finishReason)
        }
    }

    return {
        text,
        reasoning,
    }
}

export function extractGoogleText(response: unknown): string {
    return extractGoogleParts(response).text
}

export function extractGoogleReasoning(response: unknown): string {
    return extractGoogleParts(response).reasoning
}

export function extractGoogleUsage(response: unknown): { promptTokens: number; completionTokens: number } {
    const safe = response && typeof response === 'object' ? (response as GoogleResponseLike) : null
    const usage = safe?.usageMetadata || safe?.usage
    const promptTokens =
        toNumber(usage?.promptTokenCount) ??
        toNumber(usage?.prompt_tokens) ??
        toNumber(usage?.input_tokens) ??
        0
    const totalTokens = toNumber(usage?.totalTokenCount) ?? toNumber(usage?.total_tokens)
    const completionTokens =
        toNumber(usage?.candidatesTokenCount) ??
        toNumber(usage?.completion_tokens) ??
        toNumber(usage?.output_tokens) ??
        (typeof totalTokens === 'number' ? Math.max(totalTokens - promptTokens, 0) : 0)
    return { promptTokens, completionTokens }
}
