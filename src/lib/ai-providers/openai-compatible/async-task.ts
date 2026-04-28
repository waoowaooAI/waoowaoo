import { composeModelKey } from '@/lib/ai-registry/selection'
import type {
  AsyncDownloadHeaders,
  AsyncPollResult,
  AsyncTaskPollContext,
  AsyncTaskProviderRegistration,
  FormatAsyncExternalIdInput,
  ParsedAsyncExternalId,
} from '@/lib/ai-providers/async-task-types'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  normalizeResponseJson,
  readJsonPath,
  type OpenAICompatMediaTemplate,
} from './user-template'

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface OpenAiVideoTaskResponse {
  id?: unknown
  status?: unknown
  video_url?: unknown
  error?: unknown
}

interface OpenAiVideoTaskError {
  message?: unknown
}

interface OpenAiCompatPollingModel {
  modelKey: string
  modelId: string
  compatMediaTemplate?: unknown
}

function isObject(value: unknown): value is object {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function decodeProviderId(token: string): string {
  const value = token.trim()
  if (!value) {
    throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
  }
  if (value.startsWith('u_')) {
    const uuid = value.slice(2).trim()
    if (!PROVIDER_UUID_PATTERN.test(uuid)) {
      throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
    }
    return `${OPENAI_COMPAT_PROVIDER_PREFIX}${uuid.toLowerCase()}`
  }
  if (PROVIDER_UUID_PATTERN.test(value)) {
    return `${OPENAI_COMPAT_PROVIDER_PREFIX}${value.toLowerCase()}`
  }
  const encoded = value.startsWith('b64_') ? value.slice(4) : value
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8').trim()
    if (!decoded) {
      throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
    }
    return decoded
  } catch {
    throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
  }
}

function decodeModelKey(token: string): string {
  try {
    return Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw new Error('OCOMPAT_MODEL_KEY_TOKEN_INVALID')
  }
}

function resolveOCompatModelKey(providerId: string, token: string): string {
  const decoded = decodeModelKey(token).trim()
  if (!decoded) {
    throw new Error('OCOMPAT_MODEL_KEY_TOKEN_INVALID')
  }
  if (decoded.includes('::')) {
    return decoded
  }
  const composed = composeModelKey(providerId, decoded)
  if (!composed) {
    throw new Error('OCOMPAT_MODEL_KEY_TOKEN_INVALID')
  }
  return composed
}

function parseOpenAiVideoExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const providerToken = parts[2]
  const requestId = parts.slice(3).join(':')
  if (type !== 'VIDEO' || !providerToken || !requestId) {
    throw new Error(`无效 OPENAI externalId: "${externalId}"，应为 OPENAI:VIDEO:providerToken:videoId`)
  }
  return {
    provider: 'OPENAI',
    type: 'VIDEO',
    providerToken,
    requestId,
  }
}

function parseOpenAiCompatibleTemplateExternalId(externalId: string): ParsedAsyncExternalId {
  const parts = externalId.split(':')
  const type = parts[1]
  const providerToken = parts[2]
  const modelKeyToken = parts[3]
  const requestId = parts.slice(4).join(':')
  if ((type !== 'VIDEO' && type !== 'IMAGE') || !providerToken || !modelKeyToken || !requestId) {
    throw new Error(`无效 OCOMPAT externalId: "${externalId}"，应为 OCOMPAT:TYPE:providerToken:modelKeyToken:taskId`)
  }
  return {
    provider: 'OCOMPAT',
    type,
    providerToken,
    modelKeyToken,
    requestId,
  }
}

function formatOpenAiVideoExternalId(input: FormatAsyncExternalIdInput): string {
  if (!input.providerToken) {
    throw new Error('OPENAI externalId requires providerToken')
  }
  return `OPENAI:${input.type}:${input.providerToken}:${input.requestId}`
}

function formatOpenAiCompatibleTemplateExternalId(input: FormatAsyncExternalIdInput): string {
  if (!input.providerToken) {
    throw new Error('OCOMPAT externalId requires providerToken')
  }
  if (!input.modelKeyToken) {
    throw new Error('OCOMPAT externalId requires modelKeyToken')
  }
  return `OCOMPAT:${input.type}:${input.providerToken}:${input.modelKeyToken}:${input.requestId}`
}

function readOpenAiVideoTask(raw: unknown): OpenAiVideoTaskResponse {
  if (!isObject(raw)) {
    throw new Error('OPENAI_VIDEO_POLL_RESPONSE_INVALID')
  }
  return raw as OpenAiVideoTaskResponse
}

function readErrorMessage(raw: unknown): string {
  if (isObject(raw)) {
    const error = raw as OpenAiVideoTaskError
    if (typeof error.message === 'string' && error.message.trim()) return error.message
  }
  if (typeof raw === 'string' && raw.trim()) return raw
  return ''
}

async function pollOpenAIVideoTask(
  parsed: ParsedAsyncExternalId,
  context: AsyncTaskPollContext,
): Promise<AsyncPollResult> {
  if (!parsed.providerToken) {
    throw new Error('OPENAI_PROVIDER_TOKEN_MISSING')
  }
  const providerId = decodeProviderId(parsed.providerToken)
  const config = await context.getProviderConfig(context.userId, providerId)
  if (!config.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const pollUrl = `${baseUrl}/videos/${encodeURIComponent(parsed.requestId)}`
  const response = await fetch(pollUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OPENAI_VIDEO_POLL_FAILED: ${response.status} ${text.slice(0, 200)}`)
  }

  const task = readOpenAiVideoTask(await response.json())
  const status = typeof task.status === 'string' ? task.status : ''
  if (status === 'queued' || status === 'in_progress' || status === 'processing') {
    return { status: 'pending' }
  }

  if (status === 'failed') {
    const message = readErrorMessage(task.error) || `OpenAI video task failed: ${parsed.requestId}`
    return { status: 'failed', error: message }
  }

  if (status !== 'completed') {
    return { status: 'pending' }
  }

  const videoUrl = typeof task.video_url === 'string' ? task.video_url.trim() : ''
  if (videoUrl) {
    return {
      status: 'completed',
      videoUrl,
      resultUrl: videoUrl,
    }
  }

  const taskId = typeof task.id === 'string' ? task.id : parsed.requestId
  const contentUrl = `${baseUrl}/videos/${encodeURIComponent(taskId)}/content`
  return {
    status: 'completed',
    videoUrl: contentUrl,
    resultUrl: contentUrl,
    downloadHeaders: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  }
}

function readTemplate(model: OpenAiCompatPollingModel | undefined, modelKey: string): OpenAICompatMediaTemplate {
  if (!model || !model.compatMediaTemplate) {
    throw new Error(`OCOMPAT_TEMPLATE_NOT_FOUND: ${modelKey}`)
  }
  return model.compatMediaTemplate as OpenAICompatMediaTemplate
}

async function pollOpenAiCompatibleTemplateTask(input: {
  parsed: ParsedAsyncExternalId
  context: AsyncTaskPollContext
}): Promise<AsyncPollResult> {
  const { parsed, context } = input
  if (!parsed.providerToken) throw new Error('OCOMPAT_PROVIDER_TOKEN_MISSING')
  if (!parsed.modelKeyToken) throw new Error('OCOMPAT_MODEL_KEY_TOKEN_MISSING')
  const providerId = decodeProviderId(parsed.providerToken)
  const modelKey = resolveOCompatModelKey(providerId, parsed.modelKeyToken)
  const config = await context.getProviderConfig(context.userId, providerId)
  if (!config.baseUrl) throw new Error(`PROVIDER_BASE_URL_MISSING: ${providerId}`)

  const models = await context.getUserModels(context.userId)
  const model = models.find((item) => item.modelKey === modelKey)
  const template = readTemplate(model, modelKey)
  if (!model?.modelId) {
    throw new Error(`OCOMPAT_MODEL_ID_MISSING: ${modelKey}`)
  }
  if (template.mode !== 'async' || !template.status) {
    throw new Error(`OCOMPAT_TEMPLATE_NOT_ASYNC: ${modelKey}`)
  }

  const variables = buildTemplateVariables({
    model: model.modelId,
    prompt: '',
    taskId: parsed.requestId,
  })
  const statusRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: template.status,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })
  const response = await fetch(statusRequest.endpointUrl, {
    method: statusRequest.method,
    headers: statusRequest.headers,
  })
  const rawText = await response.text().catch(() => '')
  if (!response.ok) {
    return {
      status: 'failed',
      error: `OCOMPAT status request failed: ${response.status}`,
    }
  }
  const payload = normalizeResponseJson(rawText)
  const statusRaw = readJsonPath(payload, template.response.statusPath)
  const status = typeof statusRaw === 'string' ? statusRaw.trim().toLowerCase() : ''
  if (!status) {
    return {
      status: 'failed',
      error: 'OCOMPAT status path resolve failed',
    }
  }
  const doneStates = (template.polling?.doneStates || []).map((item) => item.toLowerCase())
  const failStates = (template.polling?.failStates || []).map((item) => item.toLowerCase())
  if (doneStates.includes(status)) {
    const outputUrl = readJsonPath(payload, template.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim()) {
      return {
        status: 'completed',
        resultUrl: outputUrl.trim(),
        ...(parsed.type === 'VIDEO'
          ? { videoUrl: outputUrl.trim() }
          : { imageUrl: outputUrl.trim() }),
      }
    }
    if (template.content) {
      const contentRequest = await buildRenderedTemplateRequest({
        baseUrl: config.baseUrl,
        endpoint: template.content,
        variables,
        defaultAuthHeader: `Bearer ${config.apiKey}`,
      })
      const downloadHeaders: AsyncDownloadHeaders = { ...contentRequest.headers }
      return {
        status: 'completed',
        resultUrl: contentRequest.endpointUrl,
        ...(parsed.type === 'VIDEO'
          ? { videoUrl: contentRequest.endpointUrl }
          : { imageUrl: contentRequest.endpointUrl }),
        downloadHeaders,
      }
    }
    return {
      status: 'failed',
      error: 'OCOMPAT completed but output URL missing',
    }
  }
  if (failStates.includes(status)) {
    const errorRaw = readJsonPath(payload, template.response.errorPath)
    return {
      status: 'failed',
      error: typeof errorRaw === 'string' && errorRaw.trim() ? errorRaw.trim() : `OCOMPAT task failed: ${status}`,
    }
  }
  return { status: 'pending' }
}

export const openAiVideoAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'OPENAI',
  canParseExternalId: (externalId) => externalId.startsWith('OPENAI:'),
  parseExternalId: parseOpenAiVideoExternalId,
  formatExternalId: formatOpenAiVideoExternalId,
  poll: async ({ parsed, context }) => pollOpenAIVideoTask(parsed, context),
}

export const openAiCompatibleTemplateAsyncTaskProvider: AsyncTaskProviderRegistration = {
  providerCode: 'OCOMPAT',
  canParseExternalId: (externalId) => externalId.startsWith('OCOMPAT:'),
  parseExternalId: parseOpenAiCompatibleTemplateExternalId,
  formatExternalId: formatOpenAiCompatibleTemplateExternalId,
  poll: async ({ parsed, context }) => pollOpenAiCompatibleTemplateTask({
    parsed,
    context,
  }),
}
