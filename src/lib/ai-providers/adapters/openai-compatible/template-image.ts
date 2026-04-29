import type { GenerateResult } from '@/lib/ai-providers/adapters/media/generators/base'
import type { OpenAICompatImageRequest } from './types'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  extractTemplateError,
  normalizeResponseJson,
  readJsonPath,
} from '@/lib/openai-compat-template-runtime'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { resolveOpenAICompatClientConfig } from './common'

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BODY_PREVIEW_MAX_LEN = 800
const DEFAULT_TEMPLATE_TIMEOUT_MS = 120_000

function readOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function resolveTemplateTimeoutMs(): number {
  const fromEnv = readOptionalInt(process.env.OPENAI_COMPAT_IMAGE_TEMPLATE_TIMEOUT_MS)
  if (fromEnv && fromEnv > 0) return fromEnv
  return DEFAULT_TEMPLATE_TIMEOUT_MS
}

function encodeProviderToken(providerId: string): string {
  const value = providerId.trim()
  if (value.startsWith(OPENAI_COMPAT_PROVIDER_PREFIX)) {
    const uuid = value.slice(OPENAI_COMPAT_PROVIDER_PREFIX.length).trim()
    if (PROVIDER_UUID_PATTERN.test(uuid)) {
      return `u_${uuid.toLowerCase()}`
    }
  }
  return `b64_${Buffer.from(value, 'utf8').toString('base64url')}`
}

function encodeModelRef(modelRef: string): string {
  return Buffer.from(modelRef, 'utf8').toString('base64url')
}

function resolveModelRef(request: OpenAICompatImageRequest): string {
  const modelId = typeof request.modelId === 'string' ? request.modelId.trim() : ''
  if (modelId) return modelId
  const parsed = typeof request.modelKey === 'string' ? parseModelKeyStrict(request.modelKey) : null
  if (parsed?.modelId) return parsed.modelId
  throw new Error('OPENAI_COMPAT_IMAGE_MODEL_REF_REQUIRED')
}

function readTemplateOutputUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      urls.push(item.trim())
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const url = (item as { url?: unknown }).url
    if (typeof url === 'string' && url.trim()) {
      urls.push(url.trim())
    }
  }
  return urls
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function describeError(error: unknown, maxDepth = 4): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  for (let depth = 0; depth < maxDepth && current && !seen.has(current); depth += 1) {
    seen.add(current)

    if (current instanceof Error) {
      const anyErr = current as unknown as {
        name?: unknown
        code?: unknown
        errno?: unknown
        syscall?: unknown
        cause?: unknown
      }
      const name = typeof anyErr.name === 'string' && anyErr.name.trim() ? anyErr.name.trim() : current.name
      const code = typeof anyErr.code === 'string' && anyErr.code.trim() ? anyErr.code.trim() : ''
      const errno = typeof anyErr.errno === 'string' && anyErr.errno.trim() ? anyErr.errno.trim() : ''
      const syscall = typeof anyErr.syscall === 'string' && anyErr.syscall.trim() ? anyErr.syscall.trim() : ''
      const meta = [code && `code=${code}`, errno && `errno=${errno}`, syscall && `syscall=${syscall}`]
        .filter(Boolean)
        .join(' ')
      parts.push([name, current.message, meta].filter(Boolean).join(' ').trim())
      current = anyErr.cause
      continue
    }

    if (typeof current === 'object') {
      const anyObj = current as Record<string, unknown>
      const msg = typeof anyObj.message === 'string' ? anyObj.message : ''
      const code = typeof anyObj.code === 'string' ? anyObj.code : ''
      const name = typeof anyObj.name === 'string' ? anyObj.name : 'Object'
      parts.push([name, msg, code && `code=${code}`].filter(Boolean).join(' ').trim())
      current = anyObj.cause
      continue
    }

    parts.push(String(current))
    break
  }

  return parts.filter(Boolean).join(' <- ')
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') continue
    cleaned[key] = value
  }
  return cleaned
}

function previewBody(body: BodyInit | null | undefined): string {
  if (!body) return ''
  if (typeof body === 'string') {
    if (body.length <= BODY_PREVIEW_MAX_LEN) return body
    return `${body.slice(0, BODY_PREVIEW_MAX_LEN)}...(truncated)`
  }
  if (body instanceof URLSearchParams) {
    const text = body.toString()
    if (text.length <= BODY_PREVIEW_MAX_LEN) return text
    return `${text.slice(0, BODY_PREVIEW_MAX_LEN)}...(truncated)`
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${body.byteLength}]`
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return '[FormData]'
  }
  return `[BodyInit type=${Object.prototype.toString.call(body)}]`
}

export async function generateImageViaOpenAICompatTemplate(
  request: OpenAICompatImageRequest,
): Promise<GenerateResult> {
  if (!request.template) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_REQUIRED')
  }
  if (request.template.mediaType !== 'image') {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const firstReference = Array.isArray(request.referenceImages) && request.referenceImages.length > 0
    ? request.referenceImages[0]
    : ''
  const variables = buildTemplateVariables({
    model: request.modelId || 'gpt-image-1',
    prompt: request.prompt,
    image: firstReference,
    images: request.referenceImages || [],
    aspectRatio: typeof request.options?.aspectRatio === 'string' ? request.options.aspectRatio : undefined,
    resolution: typeof request.options?.resolution === 'string' ? request.options.resolution : undefined,
    size: typeof request.options?.size === 'string' ? request.options.size : undefined,
    extra: request.options,
  })

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: request.template.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })
  if (['POST', 'PUT', 'PATCH'].includes(createRequest.method) && !createRequest.body) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_CREATE_BODY_REQUIRED')
  }
  let response: Response
  let rawText = ''
  let payload: unknown = null
  try {
    const controller = new AbortController()
    const timeoutMs = resolveTemplateTimeoutMs()
    const timeoutId = setTimeout(
      () => controller.abort(new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TIMEOUT')),
      timeoutMs,
    )
    try {
      response = await fetch(createRequest.endpointUrl, {
        method: createRequest.method,
        headers: createRequest.headers,
        signal: controller.signal,
        ...(createRequest.body ? { body: createRequest.body } : {}),
      })
      rawText = await response.text().catch(() => '')
      payload = normalizeResponseJson(rawText)
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    let modelRef = ''
    try {
      modelRef = resolveModelRef(request)
    } catch (inner) {
      modelRef = `resolve_failed:${toErrorMessage(inner)}`
    }
    const timeoutMs = resolveTemplateTimeoutMs()
    throw new Error(
      [
        'OPENAI_COMPAT_IMAGE_TEMPLATE_REQUEST_FAILED',
        `providerId=${request.providerId}`,
        `baseUrl=${config.baseUrl}`,
        `endpointUrl=${createRequest.endpointUrl}`,
        `method=${createRequest.method}`,
        `modelRef=${modelRef}`,
        `headers=${JSON.stringify(sanitizeHeaders(createRequest.headers))}`,
        ...(createRequest.body ? [`bodyPreview=${JSON.stringify(previewBody(createRequest.body))}`] : []),
        `timeoutMs=${timeoutMs}`,
        `cause=${toErrorMessage(err)}`,
        `causeDetail=${describeError(err)}`,
      ].join(' '),
    )
  }
  if (!response.ok) {
    const extracted = extractTemplateError(request.template, payload, response.status)
    throw new Error(
      [
        'OPENAI_COMPAT_IMAGE_TEMPLATE_HTTP_ERROR',
        `providerId=${request.providerId}`,
        `baseUrl=${config.baseUrl}`,
        `endpointUrl=${createRequest.endpointUrl}`,
        `method=${createRequest.method}`,
        `status=${response.status}`,
        `modelKey=${request.modelKey || ''}`,
        `modelId=${request.modelId || ''}`,
        `modelRef=${resolveModelRef(request)}`,
        `headers=${JSON.stringify(sanitizeHeaders(createRequest.headers))}`,
        ...(createRequest.body ? [`bodyPreview=${JSON.stringify(previewBody(createRequest.body))}`] : []),
        `error=${extracted}`,
      ].join(' '),
    )
  }

  if (request.template.mode === 'sync') {
    const outputUrls = readTemplateOutputUrls(
      readJsonPath(payload, request.template.response.outputUrlsPath),
    )
    if (outputUrls.length > 0) {
      const first = outputUrls[0]
      return {
        success: true,
        imageUrl: first,
        ...(outputUrls.length > 1 ? { imageUrls: outputUrls } : {}),
      }
    }

    const outputUrl = readJsonPath(payload, request.template.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim().length > 0) {
      return {
        success: true,
        imageUrl: outputUrl.trim(),
      }
    }
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND')
  }

  const taskIdRaw = readJsonPath(payload, request.template.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TASK_ID_NOT_FOUND')
  }
  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef(request))
  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:IMAGE:${providerToken}:${modelRefToken}:${taskId}`,
  }
}
