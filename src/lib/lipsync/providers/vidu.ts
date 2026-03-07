import { getProviderConfig } from '@/lib/api-config'
import type { LipSyncParams, LipSyncResult, LipSyncSubmitContext } from '@/lib/lipsync/types'

interface ViduLipSyncSubmitResponse {
  task_id?: string
  state?: string
  err_code?: string
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toAbsoluteHttpUrl(rawUrl: string): string {
  const normalized = readTrimmedString(rawUrl)
  if (!normalized) return ''
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized
  }
  if (normalized.startsWith('/')) {
    const baseUrl = (process.env.NEXTAUTH_URL || 'http://localhost:3000').trim()
    const trimmedBase = baseUrl.replace(/\/+$/, '')
    return `${trimmedBase}${normalized}`
  }
  return normalized
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (
    host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.local')
  ) {
    return true
  }

  const parts = host.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => Number.parseInt(part, 10))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false

  const [a, b] = octets
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function normalizeProviderPullUrl(inputUrl: string, field: 'video_url' | 'audio_url'): string {
  const absoluteUrl = toAbsoluteHttpUrl(inputUrl)
  if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
    throw new Error(`LIPSYNC_INPUT_URL_INVALID: ${field}`)
  }

  let parsed: URL
  try {
    parsed = new URL(absoluteUrl)
  } catch {
    throw new Error(`LIPSYNC_INPUT_URL_INVALID: ${field}`)
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`LIPSYNC_INPUT_URL_NOT_PUBLIC: ${field}`)
  }

  return absoluteUrl
}

export async function submitViduLipSync(
  params: LipSyncParams,
  context: LipSyncSubmitContext,
): Promise<LipSyncResult> {
  const videoUrl = normalizeProviderPullUrl(params.videoUrl, 'video_url')
  const audioUrl = normalizeProviderPullUrl(params.audioUrl, 'audio_url')
  const { apiKey } = await getProviderConfig(context.userId, context.providerId)
  const response = await fetch('https://api.vidu.cn/ent/v2/lip-sync', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_url: videoUrl,
      audio_url: audioUrl,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`VIDU_LIPSYNC_SUBMIT_FAILED: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as ViduLipSyncSubmitResponse
  const taskId = readTrimmedString(data.task_id)
  if (!taskId) {
    throw new Error('VIDU_LIPSYNC_TASK_ID_MISSING')
  }
  if (data.state === 'failed') {
    throw new Error(`VIDU_LIPSYNC_SUBMIT_FAILED: ${data.err_code || 'unknown'}`)
  }

  return {
    requestId: taskId,
    externalId: `VIDU:VIDEO:${taskId}`,
    async: true,
  }
}
