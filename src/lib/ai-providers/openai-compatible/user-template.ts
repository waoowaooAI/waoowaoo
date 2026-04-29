import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import {
  TEMPLATE_PLACEHOLDER_ALLOWLIST,
  type OpenAICompatMediaTemplate,
  type TemplateBodyValue,
  type TemplateEndpoint,
  type TemplateHeaderMap,
  type TemplateVariableMap,
} from '@/lib/ai-registry/openai-compatible-template'
import type { GenerateResult } from '@/lib/ai-providers/runtime-types'
import { resolveOpenAICompatClientConfig } from '@/lib/ai-providers/openai-compatible/errors'
import { toOpenAIUploadFile } from '@/lib/ai-providers/shared/openai-image'

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneTemplateBodyValue(value: TemplateBodyValue): TemplateBodyValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneTemplateBodyValue(item))
  }
  const output: Record<string, TemplateBodyValue> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = cloneTemplateBodyValue(nestedValue as TemplateBodyValue)
  }
  return output
}

function stringifyVariable(value: TemplateBodyValue | undefined): string {
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value
  return ''
}

function resolvePlaceholderValue(
  placeholder: string,
  variables: TemplateVariableMap,
): TemplateBodyValue | undefined {
  if (!(placeholder in variables)) {
    throw new Error(`OPENAI_COMPAT_TEMPLATE_VARIABLE_MISSING: ${placeholder}`)
  }
  return variables[placeholder]
}

function resolvePlaceholderText(
  placeholder: string,
  variables: TemplateVariableMap,
): string {
  return stringifyVariable(resolvePlaceholderValue(placeholder, variables))
}

function matchExactPlaceholder(value: string): string | null {
  const match = value.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/)
  return match?.[1] || null
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

function toTemplateVariableValue(value: unknown): TemplateBodyValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const items: TemplateBodyValue[] = []
    for (const item of value) {
      const converted = toTemplateVariableValue(item)
      if (converted === undefined) return undefined
      items.push(converted)
    }
    return items
  }
  if (!isRecord(value)) return undefined

  const output: Record<string, TemplateBodyValue> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    const converted = toTemplateVariableValue(nestedValue)
    if (converted === undefined) return undefined
    output[key] = converted
  }
  return output
}

function appendTemplateOptionVariables(
  target: TemplateVariableMap,
  source: { [key: string]: unknown } | undefined,
) {
  if (!source) return
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const value = toTemplateVariableValue(rawValue)
    if (value === undefined) continue
    const trimmedKey = rawKey.trim()
    if (!trimmedKey) continue
    target[trimmedKey] = value
    const snakeKey = toSnakeCase(trimmedKey)
    if (!(snakeKey in target)) {
      target[snakeKey] = value
    }
  }
}

function setHeaderIfMissing(headers: Record<string, string>, key: string, value: string) {
  const existingKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase())
  if (!existingKey) {
    headers[key] = value
  }
}

function deleteHeader(headers: Record<string, string>, key: string) {
  for (const headerKey of Object.keys(headers)) {
    if (headerKey.toLowerCase() === key.toLowerCase()) {
      delete headers[headerKey]
    }
  }
}

function isMultipartFileField(
  multipartFileFields: Set<string>,
  fieldPath: string,
): boolean {
  return multipartFileFields.has(fieldPath)
}

async function appendMultipartFileValue(
  formData: FormData,
  formKey: string,
  value: TemplateBodyValue,
  fieldPath: string,
  indexSeed: number,
): Promise<number> {
  if (typeof value === 'string') {
    formData.append(formKey, await toOpenAIUploadFile(value, indexSeed))
    return indexSeed + 1
  }
  if (Array.isArray(value)) {
    let nextIndex = indexSeed
    for (const item of value) {
      nextIndex = await appendMultipartFileValue(formData, formKey, item, fieldPath, nextIndex)
    }
    return nextIndex
  }
  throw new Error(`OPENAI_COMPAT_TEMPLATE_MULTIPART_FILE_INVALID: ${fieldPath}`)
}

async function appendMultipartValue(
  formData: FormData,
  formKey: string,
  value: TemplateBodyValue,
  fieldPath: string,
  multipartFileFields: Set<string>,
  fileIndexSeed: number,
): Promise<number> {
  if (isMultipartFileField(multipartFileFields, fieldPath)) {
    return appendMultipartFileValue(formData, formKey, value, fieldPath, fileIndexSeed)
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    formData.append(formKey, value === null ? 'null' : String(value))
    return fileIndexSeed
  }

  if (Array.isArray(value)) {
    let nextIndex = fileIndexSeed
    for (const item of value) {
      if (
        item === null
        || typeof item === 'string'
        || typeof item === 'number'
        || typeof item === 'boolean'
      ) {
        formData.append(formKey, item === null ? 'null' : String(item))
        continue
      }
      const nestedKey = `${formKey}[]`
      nextIndex = await appendMultipartValue(
        formData,
        nestedKey,
        item,
        fieldPath,
        multipartFileFields,
        nextIndex,
      )
    }
    return nextIndex
  }

  let nextIndex = fileIndexSeed
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const nextFormKey = formKey ? `${formKey}[${nestedKey}]` : nestedKey
    const nextFieldPath = fieldPath ? `${fieldPath}.${nestedKey}` : nestedKey
    nextIndex = await appendMultipartValue(
      formData,
      nextFormKey,
      nestedValue as TemplateBodyValue,
      nextFieldPath,
      multipartFileFields,
      nextIndex,
    )
  }
  return nextIndex
}

async function buildMultipartBody(
  endpoint: TemplateEndpoint,
  renderedBody: TemplateBodyValue,
): Promise<FormData> {
  if (!isRecord(renderedBody)) {
    throw new Error('OPENAI_COMPAT_TEMPLATE_MULTIPART_BODY_INVALID')
  }

  const formData = new FormData()
  const multipartFileFields = new Set(endpoint.multipartFileFields || [])
  let fileIndex = 0

  for (const [key, value] of Object.entries(renderedBody)) {
    fileIndex = await appendMultipartValue(
      formData,
      key,
      value as TemplateBodyValue,
      key,
      multipartFileFields,
      fileIndex,
    )
  }
  return formData
}

function appendUrlEncodedValue(
  params: URLSearchParams,
  formKey: string,
  value: TemplateBodyValue,
) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    params.append(formKey, value === null ? 'null' : String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendUrlEncodedValue(params, formKey, item)
    }
    return
  }
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const nextKey = formKey ? `${formKey}[${nestedKey}]` : nestedKey
    appendUrlEncodedValue(params, nextKey, nestedValue as TemplateBodyValue)
  }
}

function isImageGenerationEndpoint(path: string): boolean {
  try {
    const parsed = new URL(path, 'https://openai-compatible.local')
    const normalizedPath = parsed.pathname.replace(/\/+$/, '').toLowerCase()
    return /(?:^|\/)images\/generations$/.test(normalizedPath)
  } catch {
    const normalizedPath = path.split('?')[0]?.replace(/\/+$/, '').toLowerCase() || ''
    return /(?:^|\/)images\/generations$/.test(normalizedPath)
  }
}

function applyImageGenerationJsonDefaults(input: {
  endpoint: TemplateEndpoint
  renderedPath: string
  renderedBody: TemplateBodyValue
  variables: TemplateVariableMap
}): TemplateBodyValue {
  const contentType = input.endpoint.contentType || 'application/json'
  if (contentType !== 'application/json') return input.renderedBody
  if (!isImageGenerationEndpoint(input.renderedPath)) return input.renderedBody
  if (!isRecord(input.renderedBody)) return input.renderedBody

  const body: Record<string, TemplateBodyValue> = {
    ...(input.renderedBody as Record<string, TemplateBodyValue>),
  }

  if (body.n === undefined) {
    body.n = 1
  }

  const size = input.variables.size
  if (body.size === undefined && typeof size === 'string' && size.trim()) {
    body.size = size.trim()
  }

  if (body.model === 'gpt-image-2') {
    if (body.quality === undefined) {
      body.quality = 'low'
    }
    if (body.format === undefined && body.output_format === undefined) {
      body.format = 'jpeg'
    }
  }

  return body
}

async function buildRequestBody(
  endpoint: TemplateEndpoint,
  renderedBody: TemplateBodyValue,
  headers: Record<string, string>,
): Promise<BodyInit> {
  const contentType = endpoint.contentType || 'application/json'

  if (contentType === 'multipart/form-data') {
    deleteHeader(headers, 'Content-Type')
    return buildMultipartBody(endpoint, renderedBody)
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams()
    appendUrlEncodedValue(params, '', renderedBody)
    setHeaderIfMissing(headers, 'Content-Type', 'application/x-www-form-urlencoded')
    return params
  }

  setHeaderIfMissing(headers, 'Content-Type', 'application/json')
  return JSON.stringify(renderedBody)
}

export function renderTemplateString(
  template: string,
  variables: TemplateVariableMap,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return resolvePlaceholderText(String(key), variables)
  })
}

export function renderTemplateValue(
  value: TemplateBodyValue,
  variables: TemplateVariableMap,
): TemplateBodyValue {
  if (typeof value === 'string') {
    const exactPlaceholder = matchExactPlaceholder(value)
    if (exactPlaceholder) {
      const resolved = resolvePlaceholderValue(exactPlaceholder, variables)
      return resolved === undefined ? '' : cloneTemplateBodyValue(resolved)
    }
    return renderTemplateString(value, variables)
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, variables))
  }
  const out: Record<string, TemplateBodyValue> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    out[key] = renderTemplateValue(nestedValue as TemplateBodyValue, variables)
  }
  return out
}

export function resolveTemplateEndpointUrl(baseUrl: string, path: string): string {
  const trimmedPath = path.trim()
  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '')
  let normalizedPath = trimmedPath.replace(/^\/+/, '')

  // Prevent accidental /v1/v1 duplication for openai-compatible providers:
  // baseUrl is normalized to include /v1, so relative template path should omit /v1.
  try {
    const parsedBase = new URL(normalizedBase)
    const baseSegments = parsedBase.pathname.split('/').filter(Boolean)
    const baseEndsWithV1 = baseSegments.length > 0 && baseSegments[baseSegments.length - 1] === 'v1'
    if (baseEndsWithV1 && /^v1(?:\/|$|\?)/.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(/^v1\/?/, '')
    }
  } catch {
    // Keep original path behavior for invalid base urls; caller will fail explicitly downstream.
  }

  return `${normalizedBase}/${normalizedPath}`
}

export function renderTemplateHeaders(
  headers: TemplateHeaderMap | undefined,
  variables: TemplateVariableMap,
): Record<string, string> {
  if (!headers) return {}
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    output[key] = renderTemplateString(value, variables)
  }
  return output
}

function parsePathSegments(path: string): Array<string | number> {
  const normalized = path.replace(/^\$\./, '')
  if (!normalized) return []
  const segments: Array<string | number> = []
  const dotParts = normalized.split('.')
  for (const part of dotParts) {
    const regex = /([^[\]]+)|\[(\d+)\]/g
    let match = regex.exec(part)
    while (match) {
      if (match[1]) segments.push(match[1])
      if (match[2]) segments.push(Number.parseInt(match[2], 10))
      match = regex.exec(part)
    }
  }
  return segments
}

export function readJsonPath(payload: unknown, path: string | undefined): unknown {
  if (!path) return undefined
  if (!path.startsWith('$.')) return undefined
  const segments = parsePathSegments(path)
  let current: unknown = payload
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

export type RenderedTemplateRequest = {
  endpointUrl: string
  method: TemplateEndpoint['method']
  headers: Record<string, string>
  body?: BodyInit
}

export async function buildRenderedTemplateRequest(input: {
  baseUrl: string
  endpoint: TemplateEndpoint
  variables: TemplateVariableMap
  defaultAuthHeader?: string
}): Promise<RenderedTemplateRequest> {
  const renderedPath = renderTemplateString(input.endpoint.path, input.variables)
  const endpointUrl = resolveTemplateEndpointUrl(input.baseUrl, renderedPath)
  const headers = renderTemplateHeaders(input.endpoint.headers, input.variables)
  if (input.defaultAuthHeader && !headers.Authorization) {
    headers.Authorization = input.defaultAuthHeader
  }

  let body: BodyInit | undefined
  if (input.endpoint.bodyTemplate !== undefined) {
    const renderedBody = applyImageGenerationJsonDefaults({
      endpoint: input.endpoint,
      renderedPath,
      renderedBody: renderTemplateValue(input.endpoint.bodyTemplate, input.variables),
      variables: input.variables,
    })
    body = await buildRequestBody(input.endpoint, renderedBody, headers)
  }

  return {
    endpointUrl,
    method: input.endpoint.method,
    headers,
    ...(body !== undefined ? { body } : {}),
  }
}

export function normalizeResponseJson(rawText: string): unknown {
  const trimmed = rawText.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

export function buildTemplateVariables(input: {
  model: string
  prompt: string
  image?: string
  images?: string[]
  aspectRatio?: string
  duration?: number
  resolution?: string
  size?: string
  taskId?: string
  extra?: { [key: string]: unknown }
}): TemplateVariableMap {
  const variables: TemplateVariableMap = {
    model: input.model,
    prompt: input.prompt,
    image: input.image || '',
    images: input.images || [],
    aspect_ratio: input.aspectRatio || '',
    duration: input.duration ?? null,
    resolution: input.resolution || '',
    size: input.size || '',
    task_id: input.taskId || '',
  }
  appendTemplateOptionVariables(variables, input.extra)
  return variables
}

export function extractTemplateError(
  template: OpenAICompatMediaTemplate,
  payload: unknown,
  status: number,
): string {
  const mapped = readJsonPath(payload, template.response.errorPath)
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim()
  const fallbackCandidates = [
    readJsonPath(payload, '$.error.message_zh'),
    readJsonPath(payload, '$.error.message'),
    readJsonPath(payload, '$.message_zh'),
    readJsonPath(payload, '$.message'),
    readJsonPath(payload, '$.error'),
  ]
  for (const candidate of fallbackCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return `Template request failed with status ${status}: ${candidate.trim()}`
    }
  }
  if (typeof payload === 'string' && payload.trim()) {
    const snippet = payload.trim().slice(0, 300)
    return `Template request failed with status ${status}: ${snippet}`
  }
  if (payload && typeof payload === 'object') {
    try {
      const snippet = JSON.stringify(payload).slice(0, 300)
      if (snippet) return `Template request failed with status ${status}: ${snippet}`
    } catch {
      // Fall through to generic message below.
    }
  }
  return `Template request failed with status ${status}`
}

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ERROR_BODY_PREVIEW_CHARS = 1200
const MAX_REQUEST_BODY_PREVIEW_CHARS = 1200
const DEFAULT_IMAGE_TEMPLATE_TIMEOUT_MS = 120_000
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

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…(truncated)`
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
      const metadata = current as Error & {
        code?: unknown
        errno?: unknown
        syscall?: unknown
        cause?: unknown
      }
      const details = [
        typeof metadata.code === 'string' ? `code=${metadata.code}` : '',
        typeof metadata.errno === 'string' ? `errno=${metadata.errno}` : '',
        typeof metadata.syscall === 'string' ? `syscall=${metadata.syscall}` : '',
      ].filter(Boolean).join(' ')
      parts.push([current.name, current.message, details].filter(Boolean).join(' ').trim())
      current = metadata.cause
      continue
    }
    parts.push(String(current))
    break
  }

  return parts.filter(Boolean).join(' <- ')
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function resolveImageTemplateTimeoutMs(): number {
  return readPositiveIntEnv('OPENAI_COMPAT_IMAGE_TEMPLATE_TIMEOUT_MS', DEFAULT_IMAGE_TEMPLATE_TIMEOUT_MS)
}

function previewRequestBody(body: BodyInit | undefined): string | null {
  if (body === undefined) return null
  if (typeof body === 'string') return truncate(body, MAX_REQUEST_BODY_PREVIEW_CHARS)
  if (body instanceof URLSearchParams) return truncate(body.toString(), MAX_REQUEST_BODY_PREVIEW_CHARS)
  if (typeof FormData !== 'undefined' && body instanceof FormData) return '[FormData]'
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return `[ArrayBuffer byteLength=${body.byteLength}]`
  return `[BodyInit type=${Object.prototype.toString.call(body)}]`
}

function sanitizeHeaders(input: Record<string, string> | undefined): Record<string, string> | null {
  if (!input) return null
  const out: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(input)) {
    const lower = key.toLowerCase()
    if (SENSITIVE_HEADER_KEYS.has(lower)) {
      out[lower] = '[REDACTED]'
      continue
    }
    out[lower] = String(rawValue)
  }
  return Object.keys(out).length > 0 ? out : null
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

function resolveModelRef(kind: 'image' | 'video', input: { modelId?: string; modelKey?: string }): string {
  const modelId = typeof input.modelId === 'string' ? input.modelId.trim() : ''
  if (modelId) return modelId
  const parsed = typeof input.modelKey === 'string' ? parseModelKeyStrict(input.modelKey) : null
  if (parsed?.modelId) return parsed.modelId
  throw new Error(kind === 'image' ? 'OPENAI_COMPAT_IMAGE_MODEL_REF_REQUIRED' : 'OPENAI_COMPAT_VIDEO_MODEL_REF_REQUIRED')
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

function readTemplateImageBase64(payload: unknown): string | null {
  const candidates = [
    readJsonPath(payload, '$.data[0].b64_json'),
    readJsonPath(payload, '$.data.b64_json'),
    readJsonPath(payload, '$.b64_json'),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  const data = readJsonPath(payload, '$.data')
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!isRecord(item)) continue
      const b64 = item.b64_json
      if (typeof b64 === 'string' && b64.trim()) return b64.trim()
    }
  }
  return null
}

function imageMimeFromTemplatePayload(payload: unknown): string {
  const raw = readJsonPath(payload, '$.output_format')
  if (raw === 'jpeg' || raw === 'jpg') return 'image/jpeg'
  if (raw === 'webp') return 'image/webp'
  return 'image/png'
}

function buildUnsupportedVideoFormatError(detail: string): Error {
  return new Error(`VIDEO_API_FORMAT_UNSUPPORTED: ${detail}`)
}

function requireTemplateModelId(modelId: string | undefined, context: string): string {
  const selected = typeof modelId === 'string' ? modelId.trim() : ''
  if (!selected) {
    throw new Error(`OPENAI_COMPAT_TEMPLATE_MODEL_ID_REQUIRED:${context}`)
  }
  return selected
}

export async function generateImageViaOpenAICompatTemplate(request: {
  userId: string
  providerId: string
  modelId?: string
  modelKey?: string
  prompt: string
  referenceImages?: string[]
  options?: { [key: string]: unknown }
  profile?: string
  template: OpenAICompatMediaTemplate
}): Promise<GenerateResult> {
  if (request.template.mediaType !== 'image') {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const firstReference = Array.isArray(request.referenceImages) && request.referenceImages.length > 0
    ? request.referenceImages[0]
    : ''
  const variables = buildTemplateVariables({
    model: requireTemplateModelId(request.modelId, 'image'),
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
  try {
    const controller = new AbortController()
    const timeoutMs = resolveImageTemplateTimeoutMs()
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TIMEOUT'))
    }, timeoutMs)
    try {
      response = await fetch(createRequest.endpointUrl, {
        method: createRequest.method,
        headers: createRequest.headers,
        signal: controller.signal,
        ...(createRequest.body ? { body: createRequest.body } : {}),
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error: unknown) {
    const requestBodyPreview = previewRequestBody(createRequest.body)
    throw new Error(
      [
        'OPENAI_COMPAT_IMAGE_TEMPLATE_REQUEST_FAILED',
        `providerId=${request.providerId}`,
        `baseUrl=${config.baseUrl}`,
        `endpointUrl=${createRequest.endpointUrl}`,
        `method=${createRequest.method}`,
        `modelRef=${resolveModelRef('image', { modelId: request.modelId, modelKey: request.modelKey })}`,
        `headers=${JSON.stringify(sanitizeHeaders(createRequest.headers) || {})}`,
        ...(requestBodyPreview ? [`requestBodyPreview=${JSON.stringify(requestBodyPreview)}`] : []),
        `timeoutMs=${resolveImageTemplateTimeoutMs()}`,
        `cause=${toErrorMessage(error)}`,
        `causeDetail=${describeError(error)}`,
      ].join(' '),
      { cause: error },
    )
  }
  const rawText = await response.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)
  if (!response.ok) {
    const templateError = extractTemplateError(request.template, payload, response.status)
    const requestBodyPreview = previewRequestBody(createRequest.body)
    throw new Error(
      [
        'OPENAI_COMPAT_IMAGE_TEMPLATE_HTTP_ERROR',
        `providerId=${request.providerId}`,
        `baseUrl=${config.baseUrl}`,
        `status=${response.status}`,
        `endpointUrl=${createRequest.endpointUrl}`,
        `method=${createRequest.method}`,
        `modelKey=${request.modelKey ?? ''}`,
        `modelId=${request.modelId ?? ''}`,
        `modelRef=${resolveModelRef('image', { modelId: request.modelId, modelKey: request.modelKey })}`,
        `headers=${JSON.stringify(sanitizeHeaders(createRequest.headers) || {})}`,
        ...(requestBodyPreview ? [`requestBodyPreview=${JSON.stringify(requestBodyPreview)}`] : []),
        `bodyPreview=${JSON.stringify(truncate(rawText, MAX_ERROR_BODY_PREVIEW_CHARS))}`,
        `templateError=${truncate(templateError, 400)}`,
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

    const imageBase64 = readTemplateImageBase64(payload)
    if (imageBase64) {
      return {
        success: true,
        imageBase64,
        imageUrl: `data:${imageMimeFromTemplatePayload(payload)};base64,${imageBase64}`,
      }
    }
    throw new Error(
      [
        'OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND',
        `bodyPreview=${JSON.stringify(truncate(rawText, MAX_ERROR_BODY_PREVIEW_CHARS))}`,
      ].join(' '),
    )
  }

  const taskIdRaw = readJsonPath(payload, request.template.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TASK_ID_NOT_FOUND')
  }
  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef('image', { modelId: request.modelId, modelKey: request.modelKey }))
  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:IMAGE:${providerToken}:${modelRefToken}:${taskId}`,
  }
}

export async function generateVideoViaOpenAICompatTemplate(request: {
  userId: string
  providerId: string
  modelId?: string
  modelKey?: string
  imageUrl: string
  prompt: string
  options?: { [key: string]: unknown }
  profile?: string
  template: OpenAICompatMediaTemplate
}): Promise<GenerateResult> {
  if (request.template.mediaType !== 'video') {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const variables = buildTemplateVariables({
    model: requireTemplateModelId(request.modelId, 'video'),
    prompt: request.prompt,
    image: request.imageUrl,
    images: [request.imageUrl],
    aspectRatio: typeof request.options?.aspectRatio === 'string' ? request.options.aspectRatio : undefined,
    resolution: typeof request.options?.resolution === 'string' ? request.options.resolution : undefined,
    size: typeof request.options?.size === 'string' ? request.options.size : undefined,
    duration: typeof request.options?.duration === 'number' ? request.options.duration : undefined,
    extra: request.options,
  })

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: request.template.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })
  if (['POST', 'PUT', 'PATCH'].includes(createRequest.method) && !createRequest.body) {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_CREATE_BODY_REQUIRED')
  }
  const createResponse = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
  const rawText = await createResponse.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)

  if (!createResponse.ok) {
    const errorMessage = extractTemplateError(request.template, payload, createResponse.status)
    if ([404, 405, 415].includes(createResponse.status)) {
      throw buildUnsupportedVideoFormatError(errorMessage)
    }
    throw new Error(errorMessage)
  }

  if (request.template.mode === 'sync') {
    const outputUrl = readJsonPath(payload, request.template.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim()) {
      return {
        success: true,
        videoUrl: outputUrl.trim(),
      }
    }
    const outputUrls = readJsonPath(payload, request.template.response.outputUrlsPath)
    if (Array.isArray(outputUrls) && outputUrls.length > 0 && typeof outputUrls[0] === 'string') {
      return {
        success: true,
        videoUrl: String(outputUrls[0]).trim(),
      }
    }
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_OUTPUT_NOT_FOUND')
  }

  const taskIdRaw = readJsonPath(payload, request.template.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_TASK_ID_NOT_FOUND')
  }

  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef('video', { modelId: request.modelId, modelKey: request.modelKey }))

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:VIDEO:${providerToken}:${modelRefToken}:${taskId}`,
  }
}
