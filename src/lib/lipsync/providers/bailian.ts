import { randomUUID } from 'node:crypto'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { toFetchableUrl } from '@/lib/storage/utils'
import type { LipSyncParams, LipSyncResult, LipSyncSubmitContext } from '@/lib/lipsync/types'

const BAILIAN_LIPSYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis'
const BAILIAN_UPLOAD_POLICY_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/uploads'
const BAILIAN_OSS_RESOLVE_VALUE = 'enable'

type LipSyncInputType = 'video' | 'audio'

interface LipSyncInputAsset {
  fileName: string
  contentType: string
  buffer: Buffer
}

interface BailianUploadPolicyData {
  upload_host?: string
  upload_dir?: string
  oss_access_key_id?: string
  policy?: string
  signature?: string
  x_oss_object_acl?: string
  x_oss_forbid_overwrite?: string
  x_oss_security_token?: string
  security_token?: string
}

interface BailianUploadPolicyResponse {
  code?: string
  message?: string
  data?: BailianUploadPolicyData
}

interface BailianUploadPolicy {
  uploadHost: string
  uploadDir: string
  accessKeyId: string
  policy: string
  signature: string
  objectAcl?: string
  forbidOverwrite?: string
  securityToken?: string
}

interface BailianLipSyncSubmitResponse {
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
  }
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readContentType(value: string | null | undefined): string {
  const raw = readTrimmedString(value ?? '')
  if (!raw) return ''
  const marker = raw.indexOf(';')
  return (marker === -1 ? raw : raw.slice(0, marker)).trim().toLowerCase()
}

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } {
  const marker = dataUrl.indexOf(',')
  if (marker <= 5) {
    throw new Error('BAILIAN_LIPSYNC_DATA_URL_INVALID')
  }
  const header = dataUrl.slice(5, marker)
  const payload = dataUrl.slice(marker + 1)
  if (!header.includes(';base64')) {
    throw new Error('BAILIAN_LIPSYNC_DATA_URL_BASE64_REQUIRED')
  }
  const contentType = readContentType(header.split(';')[0]) || 'application/octet-stream'
  try {
    return {
      contentType,
      buffer: Buffer.from(payload, 'base64'),
    }
  } catch {
    throw new Error('BAILIAN_LIPSYNC_DATA_URL_DECODE_FAILED')
  }
}

function readPathExt(urlLike: string): string {
  try {
    const parsed = new URL(urlLike)
    const match = parsed.pathname.match(/\.([a-z0-9]+)$/i)
    return match ? match[1].toLowerCase() : ''
  } catch {
    const match = urlLike.match(/\.([a-z0-9]+)(?:\?|#|$)/i)
    return match ? match[1].toLowerCase() : ''
  }
}

function inferInputFileName(kind: LipSyncInputType, sourceHint: string, contentType: string): string {
  const extFromPath = readPathExt(sourceHint)
  if (extFromPath) {
    return `${kind}-${randomUUID()}.${extFromPath}`
  }
  const extFromMime = EXT_BY_CONTENT_TYPE[readContentType(contentType)]
  if (extFromMime) {
    return `${kind}-${randomUUID()}.${extFromMime}`
  }
  return `${kind}-${randomUUID()}.${kind === 'video' ? 'mp4' : 'wav'}`
}

async function resolveLipSyncInputAsset(rawInput: string, kind: LipSyncInputType): Promise<LipSyncInputAsset> {
  const input = readTrimmedString(rawInput)
  if (!input) {
    throw new Error(`BAILIAN_LIPSYNC_${kind.toUpperCase()}_INPUT_REQUIRED`)
  }

  if (input.startsWith('data:')) {
    const parsed = parseDataUrl(input)
    return {
      fileName: inferInputFileName(kind, input, parsed.contentType),
      contentType: parsed.contentType,
      buffer: parsed.buffer,
    }
  }

  const normalizedInput = await normalizeToOriginalMediaUrl(input)
  if (normalizedInput.startsWith('data:')) {
    const parsed = parseDataUrl(normalizedInput)
    return {
      fileName: inferInputFileName(kind, normalizedInput, parsed.contentType),
      contentType: parsed.contentType,
      buffer: parsed.buffer,
    }
  }

  const fetchUrl = toFetchableUrl(normalizedInput)
  let response: Response
  try {
    response = await fetch(fetchUrl)
  } catch {
    throw new Error(`BAILIAN_LIPSYNC_${kind.toUpperCase()}_FETCH_EXCEPTION`)
  }
  if (!response.ok) {
    throw new Error(`BAILIAN_LIPSYNC_${kind.toUpperCase()}_FETCH_FAILED(${response.status})`)
  }

  const contentType = readContentType(response.headers.get('content-type')) || 'application/octet-stream'
  return {
    fileName: inferInputFileName(kind, normalizedInput, contentType),
    contentType,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

async function parseBailianUploadPolicyResponse(response: Response): Promise<BailianUploadPolicyResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_UPLOAD_POLICY_RESPONSE_INVALID')
    }
    return parsed as BailianUploadPolicyResponse
  } catch {
    throw new Error('BAILIAN_UPLOAD_POLICY_RESPONSE_INVALID_JSON')
  }
}

function resolveBailianUploadPolicy(data: BailianUploadPolicyResponse): BailianUploadPolicy {
  const policyData = data.data
  const uploadHost = readTrimmedString(policyData?.upload_host)
  const uploadDir = readTrimmedString(policyData?.upload_dir)
  const accessKeyId = readTrimmedString(policyData?.oss_access_key_id)
  const policy = readTrimmedString(policyData?.policy)
  const signature = readTrimmedString(policyData?.signature)
  if (!uploadHost || !uploadDir || !accessKeyId || !policy || !signature) {
    throw new Error('BAILIAN_UPLOAD_POLICY_DATA_MISSING')
  }
  const objectAcl = readTrimmedString(policyData?.x_oss_object_acl) || undefined
  const forbidOverwrite = readTrimmedString(policyData?.x_oss_forbid_overwrite) || undefined
  const securityToken = readTrimmedString(policyData?.x_oss_security_token || policyData?.security_token) || undefined
  return {
    uploadHost,
    uploadDir,
    accessKeyId,
    policy,
    signature,
    objectAcl,
    forbidOverwrite,
    securityToken,
  }
}

async function getBailianUploadPolicy(apiKey: string, modelId: string): Promise<BailianUploadPolicy> {
  const response = await fetch(
    `${BAILIAN_UPLOAD_POLICY_ENDPOINT}?action=getPolicy&model=${encodeURIComponent(modelId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  )
  const data = await parseBailianUploadPolicyResponse(response)
  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_UPLOAD_POLICY_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }
  return resolveBailianUploadPolicy(data)
}

async function uploadToBailianTempStorage(
  policy: BailianUploadPolicy,
  asset: LipSyncInputAsset,
): Promise<string> {
  const objectKey = `${policy.uploadDir}/${asset.fileName}`
  const form = new FormData()
  form.append('OSSAccessKeyId', policy.accessKeyId)
  form.append('Signature', policy.signature)
  form.append('policy', policy.policy)
  if (policy.objectAcl) {
    form.append('x-oss-object-acl', policy.objectAcl)
  }
  if (policy.forbidOverwrite) {
    form.append('x-oss-forbid-overwrite', policy.forbidOverwrite)
  }
  if (policy.securityToken) {
    form.append('x-oss-security-token', policy.securityToken)
  }
  form.append('key', objectKey)
  form.append('success_action_status', '200')
  const assetBytes = Uint8Array.from(asset.buffer)
  form.append('file', new Blob([assetBytes], { type: asset.contentType }), asset.fileName)

  const uploadResponse = await fetch(policy.uploadHost, {
    method: 'POST',
    body: form,
  })
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    throw new Error(`BAILIAN_UPLOAD_FILE_FAILED(${uploadResponse.status}): ${errorText || 'unknown error'}`)
  }
  return `oss://${objectKey}`
}

async function parseBailianLipSyncSubmitResponse(response: Response): Promise<BailianLipSyncSubmitResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_LIPSYNC_RESPONSE_INVALID')
    }
    return parsed as BailianLipSyncSubmitResponse
  } catch {
    throw new Error('BAILIAN_LIPSYNC_RESPONSE_INVALID_JSON')
  }
}

export async function submitBailianLipSync(
  params: LipSyncParams,
  context: LipSyncSubmitContext,
): Promise<LipSyncResult> {
  const modelId = readTrimmedString(context.modelId)
  if (!modelId) {
    throw new Error(`LIPSYNC_ENDPOINT_MISSING: ${context.modelKey}`)
  }

  const { apiKey } = await getProviderConfig(context.userId, context.providerId)
  const policy = await getBailianUploadPolicy(apiKey, modelId)
  const [videoAsset, audioAsset] = await Promise.all([
    resolveLipSyncInputAsset(params.videoUrl, 'video'),
    resolveLipSyncInputAsset(params.audioUrl, 'audio'),
  ])
  const [videoUrl, audioUrl] = await Promise.all([
    uploadToBailianTempStorage(policy, videoAsset),
    uploadToBailianTempStorage(policy, audioAsset),
  ])

  const response = await fetch(BAILIAN_LIPSYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      'X-DashScope-OssResourceResolve': BAILIAN_OSS_RESOLVE_VALUE,
    },
    body: JSON.stringify({
      model: modelId,
      input: {
        video_url: videoUrl,
        audio_url: audioUrl,
      },
    }),
  })

  const data = await parseBailianLipSyncSubmitResponse(response)
  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_LIPSYNC_SUBMIT_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  const taskId = readTrimmedString(data.output?.task_id)
  if (!taskId) {
    throw new Error('BAILIAN_LIPSYNC_TASK_ID_MISSING')
  }

  return {
    requestId: taskId,
    externalId: `BAILIAN:VIDEO:${taskId}`,
    async: true,
  }
}
