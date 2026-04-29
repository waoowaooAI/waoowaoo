import { createScopedLogger } from '@/lib/logging/core'

const logger = createScopedLogger({ module: 'http.fetch-trace' })

const TRACE_ENV_KEY = 'HTTP_TRACE_YUNWU'
const TRACE_HOST_SUFFIX = 'yunwu.ai'
const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'cookie',
  'set-cookie',
])
const SENSITIVE_QUERY_KEYS = new Set([
  'key',
  'api_key',
  'apikey',
  'token',
  'access_token',
  'authorization',
])

let installed = false
let originalFetch: typeof fetch | null = null

function isTraceEnabled(): boolean {
  const raw = (process.env[TRACE_ENV_KEY] || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function isTraceTargetHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === TRACE_HOST_SUFFIX || lower.endsWith(`.${TRACE_HOST_SUFFIX}`)
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  return String(input)
}

function sanitizeHeaders(input: HeadersInit | undefined): Record<string, string> | null {
  if (!input) return null
  const headers = new Headers(input)
  const out: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()
    out[lower] = SENSITIVE_HEADER_KEYS.has(lower) ? '[REDACTED]' : value
  }
  return Object.keys(out).length > 0 ? out : null
}

function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]')
      }
    }
    return url.toString()
  } catch {
    return raw
  }
}

export function installYunwuFetchTraceIfEnabled(): void {
  if (!isTraceEnabled()) return
  if (installed) return
  if (typeof globalThis.fetch !== 'function') return

  installed = true
  originalFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlString = toUrlString(input)
    let url: URL | null = null
    try {
      url = new URL(urlString)
    } catch {
      url = null
    }

    if (!url || !isTraceTargetHostname(url.hostname)) {
      return await (originalFetch as typeof fetch)(input, init)
    }

    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase()
    const startedAt = Date.now()
    try {
      const response = await (originalFetch as typeof fetch)(input, init)
      logger.info({
        audit: true,
        message: 'yunwu fetch traced',
        details: {
          method,
          url: sanitizeUrl(urlString),
          status: response.status,
          durationMs: Date.now() - startedAt,
          requestHeaders: sanitizeHeaders(init?.headers),
        },
      })
      return response
    } catch (error) {
      logger.info({
        audit: true,
        message: 'yunwu fetch traced (exception)',
        details: {
          method,
          url: sanitizeUrl(urlString),
          durationMs: Date.now() - startedAt,
          requestHeaders: sanitizeHeaders(init?.headers),
          cause: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }) as typeof fetch
}

export function uninstallYunwuFetchTraceForTest(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch
  }
  originalFetch = null
  installed = false
}

