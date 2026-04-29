import net from 'node:net'
import path from 'node:path'
import { lookup } from 'node:dns/promises'
import { createScopedLogger } from '@/lib/logging/core'
import { getInternalBaseUrl } from '@/lib/env'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'

type StorageHelpers = Pick<typeof import('@/lib/storage'), 'getSignedUrl' | 'toFetchableUrl'>

type InputIssueReason =
  | 'next_image_unwrapped'
  | 'empty_value_skipped'
  | 'relative_path_rejected'
  | 'non_string_skipped'

export type OutboundImageInputIssue = {
  index: number
  input: unknown
  normalized?: string
  reason: InputIssueReason
}

export type OutboundImageNormalizeStage =
  | 'normalize_original'
  | 'normalize_base64'
  | 'normalize_reference'

export type OutboundImageNormalizeErrorCode =
  | 'OUTBOUND_IMAGE_EMPTY_INPUT'
  | 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT'
  | 'OUTBOUND_IMAGE_UNSAFE_URL'
  | 'OUTBOUND_IMAGE_MEDIA_ROUTE_UNRESOLVED'
  | 'OUTBOUND_IMAGE_FETCH_FAILED'
  | 'OUTBOUND_IMAGE_FETCH_EXCEPTION'
  | 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED'

export class OutboundImageNormalizeError extends Error {
  readonly code: OutboundImageNormalizeErrorCode
  readonly stage: OutboundImageNormalizeStage
  readonly input: string

  constructor(params: {
    code: OutboundImageNormalizeErrorCode
    stage: OutboundImageNormalizeStage
    input: string
    message: string
  }) {
    super(params.message)
    this.name = 'OutboundImageNormalizeError'
    this.code = params.code
    this.stage = params.stage
    this.input = params.input
  }
}

export type OutboundImageNormalizationIssue = {
  index: number
  input: string
  code: OutboundImageNormalizeErrorCode | 'OUTBOUND_IMAGE_UNKNOWN'
  stage: OutboundImageNormalizeStage
  message: string
}

const logger = createScopedLogger({
  module: 'media.outbound-image',
})

const NEXT_IMAGE_PATH = '/_next/image'
const MAX_NEXT_IMAGE_UNWRAP_DEPTH = 6
const SIGNED_URL_TTL_SECONDS = 3600
const STORAGE_KEY_PREFIXES = ['images/', 'video/', 'voice/'] as const
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

let storageHelpersPromise: Promise<StorageHelpers> | null = null

async function getStorageHelpers(): Promise<StorageHelpers> {
  if (!storageHelpersPromise) {
    storageHelpersPromise = import('@/lib/storage').then((mod) => ({
      getSignedUrl: mod.getSignedUrl,
      toFetchableUrl: mod.toFetchableUrl,
    }))
  }
  return await storageHelpersPromise
}

function normalizeInput(input: string): string {
  const value = typeof input === 'string' ? input.trim() : ''
  if (!value) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_EMPTY_INPUT',
      stage: 'normalize_original',
      input: String(input ?? ''),
      message: 'outbound image input is empty',
    })
  }
  return value
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null
  return (((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3]) >>> 0
}

function isIpv4InRange(ip: string, cidr: { base: string; maskBits: number }): boolean {
  const ipInt = ipv4ToInt(ip)
  const baseInt = ipv4ToInt(cidr.base)
  if (ipInt === null || baseInt === null) return false
  const mask = cidr.maskBits === 0 ? 0 : (~((1 << (32 - cidr.maskBits)) - 1) >>> 0) >>> 0
  return (ipInt & mask) === (baseInt & mask)
}

function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) {
    const ipv4Ranges: Array<{ base: string; maskBits: number }> = [
      { base: '0.0.0.0', maskBits: 8 },
      { base: '10.0.0.0', maskBits: 8 },
      { base: '100.64.0.0', maskBits: 10 },
      { base: '127.0.0.0', maskBits: 8 },
      { base: '169.254.0.0', maskBits: 16 },
      { base: '172.16.0.0', maskBits: 12 },
      { base: '192.0.0.0', maskBits: 24 },
      { base: '192.0.2.0', maskBits: 24 },
      { base: '192.88.99.0', maskBits: 24 },
      { base: '192.168.0.0', maskBits: 16 },
      { base: '198.18.0.0', maskBits: 15 },
      { base: '198.51.100.0', maskBits: 24 },
      { base: '203.0.113.0', maskBits: 24 },
      { base: '224.0.0.0', maskBits: 4 },
      { base: '240.0.0.0', maskBits: 4 },
      { base: '255.255.255.255', maskBits: 32 },
    ]
    return ipv4Ranges.some((range) => isIpv4InRange(ip, range))
  }

  if (family === 6) {
    const normalized = ip.toLowerCase()
    if (normalized === '::' || normalized === '::1') return true
    if (normalized.startsWith('ff')) return true
    if (/^(fc|fd)/.test(normalized)) return true
    if (/^fe[89ab]/.test(normalized)) return true
    if (normalized.startsWith('2001:db8')) return true
    const v4MappedIndex = normalized.lastIndexOf('::ffff:')
    if (v4MappedIndex !== -1) {
      const v4 = normalized.slice(v4MappedIndex + '::ffff:'.length)
      return isPrivateOrReservedIp(v4)
    }
    return false
  }

  return true
}

function isLikelyInternalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true
  if (lower.endsWith('.local')) return true
  if (lower === 'metadata.google.internal') return true
  if (lower === 'metadata' || lower === 'metadata.internal') return true
  return false
}

function toHostnameFromUrlLike(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    return new URL(value.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '::1'
}

function isTrustedInternalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  const configuredHosts = new Set<string>()

  const candidates = [
    process.env.INTERNAL_APP_URL,
    process.env.INTERNAL_TASK_API_BASE_URL,
    process.env.NEXTAUTH_URL,
    getInternalBaseUrl(),
  ]

  for (const candidate of candidates) {
    const host = toHostnameFromUrlLike(candidate)
    if (host) configuredHosts.add(host)
  }

  if (configuredHosts.has(normalized)) return true
  if (isLoopbackHostname(normalized)) {
    for (const host of configuredHosts) {
      if (isLoopbackHostname(host)) return true
    }
  }

  return false
}

async function assertSafeOutboundHttpUrl(input: string, stage: OutboundImageNormalizeStage): Promise<void> {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT',
      stage,
      input,
      message: `invalid outbound http url: ${input}`,
    })
  }

  if (url.username || url.password) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage,
      input,
      message: 'outbound url with credentials is not allowed',
    })
  }

  const hostname = url.hostname.toLowerCase()
  if (isTrustedInternalHostname(hostname)) return

  if (isLikelyInternalHostname(hostname)) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage,
      input,
      message: `outbound url hostname is not allowed: ${hostname}`,
    })
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new OutboundImageNormalizeError({
        code: 'OUTBOUND_IMAGE_UNSAFE_URL',
        stage,
        input,
        message: `outbound url resolves to private ip: ${hostname}`,
      })
    }
    return
  }

  let resolved: Array<{ address: string }> = []
  try {
    const lookupResult = await lookup(hostname, { all: true, verbatim: true }) as unknown
    const candidates = Array.isArray(lookupResult) ? lookupResult : [lookupResult]
    resolved = candidates
      .map((item): { address: string } | null => {
        if (!item || typeof item !== 'object') return null
        const address = (item as { address?: unknown }).address
        if (typeof address !== 'string' || !address.trim()) return null
        return { address: address.trim() }
      })
      .filter((item): item is { address: string } => item !== null)
  } catch (error) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage,
      input,
      message: `outbound url dns lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  if (resolved.length === 0) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage,
      input,
      message: 'outbound url dns lookup returned no results',
    })
  }

  const firstPrivate = resolved.find((item) => isPrivateOrReservedIp(item.address))
  if (firstPrivate) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage,
      input,
      message: `outbound url resolves to private ip: ${firstPrivate.address}`,
    })
  }
}

function isAbsoluteOrRootPath(value: string): boolean {
  return isHttpUrl(value) || value.startsWith('/')
}

function isStorageKey(value: string): boolean {
  return STORAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function isNextImagePath(pathname: string): boolean {
  return pathname === NEXT_IMAGE_PATH || pathname.endsWith(NEXT_IMAGE_PATH)
}

function decodeRepeatedly(raw: string): string {
  let value = raw
  for (let i = 0; i < MAX_NEXT_IMAGE_UNWRAP_DEPTH; i += 1) {
    try {
      const decoded = decodeURIComponent(value)
      if (decoded === value) {
        break
      }
      value = decoded
    } catch {
      break
    }
  }
  return value
}

function normalizeUnwrappedTarget(raw: string): string {
  const value = decodeRepeatedly(raw).trim()
  if (!value) return value
  if (isAbsoluteOrRootPath(value) || isDataUrl(value) || isStorageKey(value)) return value
  if (value.startsWith('m/')) return `/${value}`
  if (value.startsWith('api/')) return `/${value}`
  return value
}

function toUrlMaybe(value: string): URL | null {
  try {
    if (isHttpUrl(value)) return new URL(value)
    if (value.startsWith('/')) return new URL(value, 'http://localhost')
  } catch {
    return null
  }
  return null
}

function detectMimeFromBuffer(buffer: Uint8Array): string | null {
  if (buffer.length >= 8) {
    const isPng =
      buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a
    if (isPng) return 'image/png'
  }

  if (buffer.length >= 3) {
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    if (isJpeg) return 'image/jpeg'
  }

  if (buffer.length >= 6) {
    const isGif87a =
      buffer[0] === 0x47
      && buffer[1] === 0x49
      && buffer[2] === 0x46
      && buffer[3] === 0x38
      && buffer[4] === 0x37
      && buffer[5] === 0x61
    const isGif89a =
      buffer[0] === 0x47
      && buffer[1] === 0x49
      && buffer[2] === 0x46
      && buffer[3] === 0x38
      && buffer[4] === 0x39
      && buffer[5] === 0x61
    if (isGif87a || isGif89a) return 'image/gif'
  }

  if (buffer.length >= 12) {
    const isWebp =
      buffer[0] === 0x52
      && buffer[1] === 0x49
      && buffer[2] === 0x46
      && buffer[3] === 0x46
      && buffer[8] === 0x57
      && buffer[9] === 0x45
      && buffer[10] === 0x42
      && buffer[11] === 0x50
    if (isWebp) return 'image/webp'
  }

  if (buffer.length >= 12) {
    const isWav =
      buffer[0] === 0x52
      && buffer[1] === 0x49
      && buffer[2] === 0x46
      && buffer[3] === 0x46
      && buffer[8] === 0x57
      && buffer[9] === 0x41
      && buffer[10] === 0x56
      && buffer[11] === 0x45
    if (isWav) return 'audio/wav'
  }

  if (buffer.length >= 4) {
    const isOgg =
      buffer[0] === 0x4f
      && buffer[1] === 0x67
      && buffer[2] === 0x67
      && buffer[3] === 0x53
    if (isOgg) return 'audio/ogg'
  }

  if (buffer.length >= 3) {
    const isMp3WithId3 =
      buffer[0] === 0x49
      && buffer[1] === 0x44
      && buffer[2] === 0x33
    const isMp3FrameSync =
      buffer[0] === 0xff
      && (buffer[1] & 0xe0) === 0xe0
    if (isMp3WithId3 || isMp3FrameSync) return 'audio/mpeg'
  }

  if (buffer.length >= 12) {
    const isWebm =
      buffer[0] === 0x1a
      && buffer[1] === 0x45
      && buffer[2] === 0xdf
      && buffer[3] === 0xa3
    if (isWebm) return 'video/webm'
  }

  if (buffer.length >= 8) {
    const isMp4 =
      buffer[4] === 0x66
      && buffer[5] === 0x74
      && buffer[6] === 0x79
      && buffer[7] === 0x70
    if (isMp4) return 'video/mp4'
  }

  return null
}

function guessContentType(input: string, contentTypeHeader: string | null, buffer: Uint8Array): string {
  const headerType = contentTypeHeader?.split(';')[0]?.trim()
  if (headerType && headerType !== DEFAULT_CONTENT_TYPE) return headerType
  const sniffedType = detectMimeFromBuffer(buffer)
  if (sniffedType) return sniffedType
  const parsed = toUrlMaybe(input)
  const pathname = parsed?.pathname ?? input
  const ext = path.extname(pathname).toLowerCase()
  return MIME_BY_EXT[ext] || DEFAULT_CONTENT_TYPE
}

async function signStorageKey(storageKey: string): Promise<string> {
  const { getSignedUrl, toFetchableUrl } = await getStorageHelpers()
  return toFetchableUrl(getSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS))
}

async function toFetchableAbsoluteUrl(value: string): Promise<string> {
  const { toFetchableUrl } = await getStorageHelpers()
  return toFetchableUrl(value)
}

function unwrapNextImageInternal(input: string): string {
  let current = input.trim()
  for (let i = 0; i < MAX_NEXT_IMAGE_UNWRAP_DEPTH; i += 1) {
    const parsed = toUrlMaybe(current)
    if (!parsed || !isNextImagePath(parsed.pathname)) {
      break
    }
    const wrapped = parsed.searchParams.get('url')
    if (!wrapped) {
      break
    }
    const unwrapped = normalizeUnwrappedTarget(wrapped)
    if (!unwrapped || unwrapped === current) {
      break
    }
    current = unwrapped
  }
  return current
}

async function normalizeMediaRouteUrl(input: string): Promise<string | null> {
  const parsed = toUrlMaybe(input)
  if (!parsed || !parsed.pathname.startsWith('/m/')) {
    return null
  }

  const mediaPath = parsed.pathname
  const storageKey = await resolveStorageKeyFromMediaValue(mediaPath)
  if (!storageKey) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_MEDIA_ROUTE_UNRESOLVED',
      stage: 'normalize_original',
      input,
      message: `failed to resolve /m route to storage key: ${mediaPath}`,
    })
  }

  return await signStorageKey(storageKey)
}

export function unwrapNextImageDisplayUrl(input: string): string {
  return unwrapNextImageInternal(input)
}

export async function normalizeToOriginalMediaUrl(input: string): Promise<string> {
  const normalizedInput = normalizeInput(input)
  if (isDataUrl(normalizedInput)) {
    return normalizedInput
  }

  const unwrappedInput = unwrapNextImageInternal(normalizedInput)
  if (unwrappedInput !== normalizedInput) {
    return await normalizeToOriginalMediaUrl(unwrappedInput)
  }

  if (isStorageKey(unwrappedInput)) {
    return await signStorageKey(unwrappedInput)
  }

  const mediaRouteUrl = await normalizeMediaRouteUrl(unwrappedInput)
  if (mediaRouteUrl) {
    return mediaRouteUrl
  }

  if (unwrappedInput.startsWith('/')) {
    if (unwrappedInput.startsWith('/api/')) {
      const apiPath = unwrappedInput
      return await toFetchableAbsoluteUrl(apiPath)
    }
    const rootStorageKey = unwrappedInput.slice(1)
    if (isStorageKey(rootStorageKey)) {
      return await signStorageKey(rootStorageKey)
    }
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT',
      stage: 'normalize_original',
      input: unwrappedInput,
      message: `unsupported root-relative outbound image input: ${unwrappedInput}`,
    })
  }

  if (isHttpUrl(unwrappedInput)) {
    await assertSafeOutboundHttpUrl(unwrappedInput, 'normalize_original')
    return unwrappedInput
  }

  const storageKey = await resolveStorageKeyFromMediaValue(unwrappedInput)
  if (storageKey) {
    return await signStorageKey(storageKey)
  }

  throw new OutboundImageNormalizeError({
    code: 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT',
    stage: 'normalize_original',
    input: unwrappedInput,
    message: `unsupported outbound image input: ${unwrappedInput}`,
  })
}

export async function normalizeToBase64ForGeneration(input: string): Promise<string> {
  const normalizedUrl = await normalizeToOriginalMediaUrl(input)
  if (isDataUrl(normalizedUrl)) {
    return normalizedUrl
  }

  const fetchUrl = await toFetchableAbsoluteUrl(normalizedUrl)
  const MAX_REDIRECTS = 3

  let response: Response | null = null
  try {
    let currentUrl = fetchUrl
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
      if (isHttpUrl(currentUrl)) {
        await assertSafeOutboundHttpUrl(currentUrl, 'normalize_base64')
      }
      response = await fetch(currentUrl, { redirect: 'manual' })
      const status = response.status
      if (status >= 300 && status < 400) {
        const location = response.headers.get('location')
        if (!location) break
        currentUrl = new URL(location, currentUrl).toString()
        continue
      }
      break
    }
  } catch (error) {
    if (error instanceof OutboundImageNormalizeError) {
      throw error
    }
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_FETCH_EXCEPTION',
      stage: 'normalize_base64',
      input: normalizedUrl,
      message: `normalizeToBase64ForGeneration fetch exception: ${fetchUrl}`,
    })
  }

  if (!response) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_FETCH_EXCEPTION',
      stage: 'normalize_base64',
      input: normalizedUrl,
      message: `normalizeToBase64ForGeneration missing response: ${fetchUrl}`,
    })
  }

  if (!response.ok) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_FETCH_FAILED',
      stage: 'normalize_base64',
      input: normalizedUrl,
      message: `normalizeToBase64ForGeneration fetch failed (${response.status}): ${fetchUrl}`,
    })
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const mimeType = guessContentType(normalizedUrl, response.headers.get('content-type'), buffer)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function toNormalizationIssue(
  error: unknown,
  input: string,
  index: number,
): OutboundImageNormalizationIssue {
  if (error instanceof OutboundImageNormalizeError) {
    return {
      index,
      input,
      code: error.code,
      stage: error.stage,
      message: error.message,
    }
  }
  return {
    index,
    input,
    code: 'OUTBOUND_IMAGE_UNKNOWN',
    stage: 'normalize_reference',
    message: error instanceof Error ? error.message : String(error),
  }
}

export async function normalizeReferenceImagesForGeneration(
  inputs: string[],
  options: {
    onIssue?: (issue: OutboundImageNormalizationIssue) => void
    context?: Record<string, unknown>
  } = {},
): Promise<string[]> {
  const seen = new Set<string>()
  const normalized: string[] = []
  let candidateCount = 0

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index]
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    candidateCount += 1

    try {
      normalized.push(await normalizeToBase64ForGeneration(trimmed))
    } catch (error) {
      const issue = toNormalizationIssue(error, trimmed, index)
      options.onIssue?.(issue)
      logger.warn({
        message: 'reference image normalize failed',
        details: {
          ...issue,
          context: options.context || null,
        },
      })
    }
  }

  if (candidateCount > 0 && normalized.length === 0) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED',
      stage: 'normalize_reference',
      input: `candidates=${candidateCount}`,
      message: 'all reference images failed to normalize',
    })
  }

  return normalized
}

export async function normalizeOptionalReferenceImagesForGeneration(
  inputs: string[],
  options: {
    onIssue?: (issue: OutboundImageNormalizationIssue) => void
    context?: Record<string, unknown>
  } = {},
): Promise<string[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) return []

  try {
    return await normalizeReferenceImagesForGeneration(inputs, options)
  } catch (error) {
    if (error instanceof OutboundImageNormalizeError && error.code === 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED') {
      logger.warn({
        message: 'optional reference images all failed to normalize, continue without references',
        details: {
          context: options.context || null,
          inputCount: inputs.length,
        },
      })
      return []
    }
    throw error
  }
}

export function sanitizeImageInputsForTaskPayload(inputs: unknown[]): {
  normalized: string[]
  issues: OutboundImageInputIssue[]
} {
  const issues: OutboundImageInputIssue[] = []
  const normalized: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < inputs.length; i += 1) {
    const raw = inputs[i]
    if (typeof raw !== 'string') {
      issues.push({ index: i, input: raw, reason: 'non_string_skipped' })
      continue
    }

    const trimmed = raw.trim()
    if (!trimmed) {
      issues.push({ index: i, input: raw, reason: 'empty_value_skipped' })
      continue
    }

    const unwrapped = unwrapNextImageInternal(trimmed)
    if (unwrapped !== trimmed) {
      issues.push({ index: i, input: raw, normalized: unwrapped, reason: 'next_image_unwrapped' })
    }

    if (unwrapped.startsWith('/') && !unwrapped.startsWith('/m/') && !unwrapped.startsWith('/api/')) {
      issues.push({ index: i, input: raw, normalized: unwrapped, reason: 'relative_path_rejected' })
      continue
    }

    if (seen.has(unwrapped)) continue
    seen.add(unwrapped)
    normalized.push(unwrapped)
  }

  return { normalized, issues }
}
