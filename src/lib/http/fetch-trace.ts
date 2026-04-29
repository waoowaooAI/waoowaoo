import { createScopedLogger } from '@/lib/logging/core'

let installed = false

function shouldTraceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.hostname === 'yunwu.ai' || url.hostname.endsWith('.yunwu.ai')
  } catch {
    return rawUrl.includes('yunwu.ai')
  }
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    for (const key of ['key', 'api_key', 'apiKey', 'access_token', 'token']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '***')
      }
    }
    return url.toString()
  } catch {
    return rawUrl.replace(/([?&](?:key|api_key|apiKey|access_token|token)=)[^&]+/g, '$1***')
  }
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()
    if (
      lower === 'authorization'
      || lower === 'x-goog-api-key'
      || lower === 'api-key'
      || lower === 'x-api-key'
      || lower === 'cookie'
      || lower === 'set-cookie'
    ) {
      out[key] = '***'
      continue
    }
    out[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value
  }
  return out
}

function sanitizeText(value: string): string {
  // Conservative: strip obvious bearer tokens and query keys if present.
  return value
    .replace(/(Bearer)\s+([A-Za-z0-9._-]+)/gi, '$1 ***')
    .replace(/([?&](?:key|api_key|apiKey|access_token|token)=)[^&]+/g, '$1***')
}

function previewString(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…`
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function summarizeGeminiBody(parsed: unknown): Record<string, unknown> | null {
  if (!isRecord(parsed)) return null

  const generationConfig = isRecord(parsed.generationConfig) ? parsed.generationConfig : null
  const imageConfig = generationConfig && isRecord(generationConfig.imageConfig) ? generationConfig.imageConfig : null
  const responseModalities = Array.isArray(generationConfig?.responseModalities)
    ? generationConfig?.responseModalities
    : null

  const contents = Array.isArray(parsed.contents) ? parsed.contents : null
  let partsCount = 0
  let textParts = 0
  let inlineParts = 0
  let totalTextChars = 0
  if (contents) {
    for (const content of contents) {
      if (!isRecord(content) || !Array.isArray(content.parts)) continue
      for (const part of content.parts) {
        if (!isRecord(part)) continue
        partsCount += 1
        if (typeof part.text === 'string') {
          textParts += 1
          totalTextChars += part.text.length
        }
        if (part.inline_data || part.inlineData) {
          inlineParts += 1
        }
      }
    }
  }

  return {
    topKeys: Object.keys(parsed).slice(0, 20),
    contentsCount: contents?.length ?? null,
    partsCount,
    textParts,
    inlineParts,
    totalTextChars,
    generationConfig: generationConfig
      ? {
        keys: Object.keys(generationConfig).slice(0, 20),
        responseModalities,
        imageConfig: imageConfig
          ? {
            aspectRatio: imageConfig.aspectRatio,
            imageSize: imageConfig.imageSize,
          }
          : null,
      }
      : null,
    safetySettingsPresent: Array.isArray(parsed.safetySettings),
  }
}

function summarizeRequestBody(bodyText: string, contentType: string | null): Record<string, unknown> {
  const trimmed = bodyText.trim()
  if (!trimmed) return { kind: 'empty' }

  const isJson = (contentType || '').toLowerCase().includes('application/json')
  if (isJson) {
    const parsed = safeJsonParse(trimmed)
    const geminiSummary = summarizeGeminiBody(parsed)
    if (geminiSummary) {
      return { kind: 'json.gemini', ...geminiSummary }
    }
    if (isRecord(parsed)) {
      return { kind: 'json', topKeys: Object.keys(parsed).slice(0, 20) }
    }
  }

  return {
    kind: isJson ? 'text.json_parse_failed' : 'text',
    length: bodyText.length,
    preview: previewString(sanitizeText(bodyText), 800),
  }
}

export function installYunwuFetchTraceIfEnabled(): void {
  if (installed) return
  if (process.env.HTTP_TRACE_YUNWU !== '1') return
  installed = true

  const logger = createScopedLogger({ module: 'http.trace', action: 'fetch.yunwu' })

  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') {
    logger.warn({
      audit: true,
      message: 'global fetch is not available, skip installing yunwu fetch trace',
    })
    return
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let request: Request
    try {
      request = new Request(input, init)
    } catch (err) {
      // Fallback: let fetch throw original error
      return await (originalFetch as typeof fetch)(input, init)
    }

    if (!shouldTraceUrl(request.url)) {
      return await (originalFetch as typeof fetch)(input, init)
    }

    const startedAt = Date.now()
    const url = sanitizeUrl(request.url)

    let requestBodyText = ''
    try {
      requestBodyText = await request.clone().text()
    } catch {
      requestBodyText = ''
    }

    logger.info({
      audit: true,
      message: 'yunwu fetch request',
      details: {
        url,
        method: request.method,
        headers: sanitizeHeaders(request.headers),
        body: summarizeRequestBody(requestBodyText, request.headers.get('content-type')),
      },
    })

    const response = await (originalFetch as typeof fetch)(request)

    let responseText = ''
    try {
      responseText = await response.clone().text()
    } catch {
      responseText = ''
    }

    logger.info({
      audit: true,
      message: 'yunwu fetch response',
      durationMs: Date.now() - startedAt,
      details: {
        url,
        status: response.status,
        headers: sanitizeHeaders(response.headers),
        bodyPreview: previewString(sanitizeText(responseText), 1000),
      },
    })

    return response
  }) as typeof fetch

  logger.info({
    audit: true,
    message: 'installed yunwu fetch trace',
    details: {
      env: 'HTTP_TRACE_YUNWU=1',
    },
  })
}
