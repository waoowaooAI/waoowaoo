import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'
import { resolveOpenAICompatClientConfig } from '@/lib/model-gateway/openai-compat/common'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  extractTemplateError,
  normalizeResponseJson,
  readJsonPath,
} from '@/lib/openai-compat-template-runtime'

export interface MediaTemplateProbeTrace {
  endpoint: 'create' | 'status'
  url: string
  method: string
  status?: number
  note: string
  bodySnippet?: string
}

export type MediaTemplateProbeResult =
  | {
    success: true
    verified: true
    checkedAt: string
    traces: MediaTemplateProbeTrace[]
  }
  | {
    success: false
    verified: false
    code: 'MODEL_TEMPLATE_PROBE_FAILED'
    checkedAt: string
    traces: MediaTemplateProbeTrace[]
    message: string
  }

function toSnippet(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 500)
}

export async function probeMediaTemplate(input: {
  userId: string
  providerId: string
  modelId: string
  template: OpenAICompatMediaTemplate
  samplePrompt?: string
  sampleImage?: string
}): Promise<MediaTemplateProbeResult> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const checkedAt = new Date().toISOString()
  const traces: MediaTemplateProbeTrace[] = []

  const variables = buildTemplateVariables({
    model: input.modelId,
    prompt: input.samplePrompt || 'probe',
    image: input.sampleImage || '',
  })

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: input.template.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })

  const createResponse = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
  const createRawText = await createResponse.text().catch(() => '')
  const createPayload = normalizeResponseJson(createRawText)

  traces.push({
    endpoint: 'create',
    url: createRequest.endpointUrl,
    method: createRequest.method,
    status: createResponse.status,
    note: createResponse.ok ? 'create succeeded' : 'create failed',
    ...(toSnippet(createRawText) ? { bodySnippet: toSnippet(createRawText) } : {}),
  })

  if (!createResponse.ok) {
    return {
      success: false,
      verified: false,
      code: 'MODEL_TEMPLATE_PROBE_FAILED',
      checkedAt,
      traces,
      message: extractTemplateError(input.template, createPayload, createResponse.status),
    }
  }

  if (input.template.mode === 'sync') {
    const outputUrl = readJsonPath(createPayload, input.template.response.outputUrlPath)
    const outputUrls = readJsonPath(createPayload, input.template.response.outputUrlsPath)
    const hasSingle = typeof outputUrl === 'string' && outputUrl.trim().length > 0
    const hasArray = Array.isArray(outputUrls) && outputUrls.length > 0
    if (!hasSingle && !hasArray) {
      return {
        success: false,
        verified: false,
        code: 'MODEL_TEMPLATE_PROBE_FAILED',
        checkedAt,
        traces,
        message: 'sync template probe failed: output url not found',
      }
    }
    return {
      success: true,
      verified: true,
      checkedAt,
      traces,
    }
  }

  const taskIdRaw = readJsonPath(createPayload, input.template.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId || !input.template.status) {
    return {
      success: false,
      verified: false,
      code: 'MODEL_TEMPLATE_PROBE_FAILED',
      checkedAt,
      traces,
      message: 'async template probe failed: task_id or status endpoint missing',
    }
  }

  const statusVariables = buildTemplateVariables({
    model: input.modelId,
    prompt: input.samplePrompt || 'probe',
    taskId,
  })
  const statusRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: input.template.status,
    variables: statusVariables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })

  const statusResponse = await fetch(statusRequest.endpointUrl, {
    method: statusRequest.method,
    headers: statusRequest.headers,
  })
  const statusRawText = await statusResponse.text().catch(() => '')
  traces.push({
    endpoint: 'status',
    url: statusRequest.endpointUrl,
    method: statusRequest.method,
    status: statusResponse.status,
    note: statusResponse.ok ? 'status succeeded' : 'status failed',
    ...(toSnippet(statusRawText) ? { bodySnippet: toSnippet(statusRawText) } : {}),
  })

  if (!statusResponse.ok) {
    return {
      success: false,
      verified: false,
      code: 'MODEL_TEMPLATE_PROBE_FAILED',
      checkedAt,
      traces,
      message: `status probe failed: ${statusResponse.status}`,
    }
  }

  return {
    success: true,
    verified: true,
    checkedAt,
    traces,
  }
}
