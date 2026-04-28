import { ApiError } from '@/lib/api-errors'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-providers/openai-compatible/user-template'
import type { StoredModel } from './api-config-types'
import { getProviderKey } from './api-config-shared'

function isOpenAICompatibleLlmModel(model: StoredModel): boolean {
  return model.type === 'llm' && getProviderKey(model.provider) === 'openai-compatible'
}

function isOpenAICompatibleMediaTemplateModel(model: StoredModel): boolean {
  if (getProviderKey(model.provider) !== 'openai-compatible') return false
  return model.type === 'image' || model.type === 'video'
}

function getDefaultMediaTemplate(type: 'image' | 'video'): OpenAICompatMediaTemplate {
  if (type === 'image') {
    return {
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        method: 'POST',
        path: '/images/generations',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      response: {
        outputUrlPath: '$.data[0].url',
        outputUrlsPath: '$.data',
        errorPath: '$.error.message',
      },
    }
  }

  return {
    version: 1,
    mediaType: 'video',
    mode: 'async',
    create: {
      method: 'POST',
      path: '/videos',
      contentType: 'multipart/form-data',
      multipartFileFields: ['input_reference'],
      bodyTemplate: {
        model: '{{model}}',
        prompt: '{{prompt}}',
        seconds: '{{duration}}',
        size: '{{size}}',
        input_reference: '{{image}}',
      },
    },
    status: {
      method: 'GET',
      path: '/videos/{{task_id}}',
    },
    content: {
      method: 'GET',
      path: '/videos/{{task_id}}/content',
    },
    response: {
      taskIdPath: '$.id',
      statusPath: '$.status',
      errorPath: '$.error.message',
    },
    polling: {
      intervalMs: 3000,
      timeoutMs: 600000,
      doneStates: ['completed', 'succeeded'],
      failStates: ['failed', 'error', 'canceled'],
    },
  }
}

export function resolveStoredLlmProtocols(
  models: StoredModel[],
  existingModels: StoredModel[],
): StoredModel[] {
  const existingByModelKey = new Map(existingModels.map((model) => [model.modelKey, model] as const))
  const checkedAtFallback = new Date().toISOString()

  return models.map((model, index) => {
    const isTargetModel = isOpenAICompatibleLlmModel(model)

    if (!isTargetModel) {
      if (model.llmProtocol !== undefined || model.llmProtocolCheckedAt !== undefined) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'MODEL_LLM_PROTOCOL_NOT_ALLOWED',
          field: `models[${index}].llmProtocol`,
        })
      }
      return model
    }

    if (model.llmProtocol) {
      return {
        ...model,
        llmProtocolCheckedAt: model.llmProtocolCheckedAt || checkedAtFallback,
      }
    }

    const existing = existingByModelKey.get(model.modelKey)
    if (existing?.llmProtocol) {
      return {
        ...model,
        llmProtocol: existing.llmProtocol,
        llmProtocolCheckedAt: existing.llmProtocolCheckedAt || checkedAtFallback,
      }
    }
    if (existing) {
      return {
        ...model,
        llmProtocol: 'chat-completions',
        llmProtocolCheckedAt: checkedAtFallback,
      }
    }

    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_LLM_PROTOCOL_REQUIRED',
      field: `models[${index}].llmProtocol`,
    })
  })
}

export function resolveStoredMediaTemplates(
  models: StoredModel[],
  existingModels: StoredModel[],
): StoredModel[] {
  const existingByModelKey = new Map(existingModels.map((model) => [model.modelKey, model] as const))
  const checkedAtFallback = new Date().toISOString()

  return models.map((model, index) => {
    const isTargetModel = isOpenAICompatibleMediaTemplateModel(model)

    if (!isTargetModel) {
      if (model.compatMediaTemplate !== undefined || model.compatMediaTemplateCheckedAt !== undefined || model.compatMediaTemplateSource !== undefined) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'MODEL_COMPAT_MEDIA_TEMPLATE_NOT_ALLOWED',
          field: `models[${index}].compatMediaTemplate`,
        })
      }
      return model
    }

    const expectedMediaType = model.type === 'image' ? 'image' : 'video'
    if (model.compatMediaTemplate) {
      if (model.compatMediaTemplate.mediaType !== expectedMediaType) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'MODEL_COMPAT_MEDIA_TEMPLATE_MEDIATYPE_MISMATCH',
          field: `models[${index}].compatMediaTemplate.mediaType`,
        })
      }
      return {
        ...model,
        compatMediaTemplateCheckedAt: model.compatMediaTemplateCheckedAt || checkedAtFallback,
        compatMediaTemplateSource: model.compatMediaTemplateSource || 'ai',
      }
    }

    const existing = existingByModelKey.get(model.modelKey)
    if (existing?.compatMediaTemplate) {
      return {
        ...model,
        compatMediaTemplate: existing.compatMediaTemplate,
        compatMediaTemplateCheckedAt: existing.compatMediaTemplateCheckedAt || checkedAtFallback,
        compatMediaTemplateSource: existing.compatMediaTemplateSource || 'manual',
      }
    }

    return {
      ...model,
      compatMediaTemplate: getDefaultMediaTemplate(expectedMediaType),
      compatMediaTemplateCheckedAt: checkedAtFallback,
      compatMediaTemplateSource: 'manual',
    }
  })
}
