import { ApiError } from '@/lib/api-errors'
import type { StoredModel } from './api-config-types'
import { getProviderKey } from './api-config-shared'

function isOpenAICompatibleLlmModel(model: StoredModel): boolean {
  return model.type === 'llm' && getProviderKey(model.provider) === 'openai-compatible'
}

function isOpenAICompatibleMediaTemplateModel(model: StoredModel): boolean {
  if (getProviderKey(model.provider) !== 'openai-compatible') return false
  return model.type === 'image' || model.type === 'video'
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

    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED',
      field: `models[${index}].compatMediaTemplate`,
    })
  })
}
