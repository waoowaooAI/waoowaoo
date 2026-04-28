import { ApiError } from '@/lib/api-errors'
import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { getCapabilityOptionFields, resolveBuiltinModelContext } from '@/lib/ai-registry/capabilities-catalog'
import { findBuiltinPricingCatalogEntry, type PricingApiType } from '@/lib/ai-registry/pricing-catalog'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import type { OpenAICompatMediaTemplate, OpenAICompatMediaTemplateSource } from '@/lib/ai-registry/openai-compatible-template'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template/validator'
import type { LlmProtocolType, StoredModel, StoredProvider } from './api-config-types'
import { getProviderKey, isLlmProtocol, isMediaTemplateSource, isRecord, isUnifiedModelType, readTrimmedString } from './api-config-shared'
import { resolveProviderByIdOrKey } from './api-config-provider-normalization'
import { resolveBuiltinCapabilities } from './api-config-pricing-display'
import { hasCustomPricingForType, normalizeCustomPricing } from './api-config-custom-pricing'

const BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE: Readonly<Record<StoredModel['type'], PricingApiType | null>> = {
  llm: 'text',
  image: 'image',
  video: 'video',
  audio: 'voice',
  lipsync: 'lip-sync',
}

const OPTIONAL_PRICING_PROVIDER_KEYS = new Set([
  'openai-compatible',
  'gemini-compatible',
  'bailian',
  'siliconflow',
])

export function withBuiltinCapabilities(model: StoredModel): StoredModel {
  const capabilities = resolveBuiltinCapabilities(model.type, model.provider, model.modelId)
  if (!capabilities) {
    return {
      ...model,
      capabilities: undefined,
    }
  }

  return {
    ...model,
    capabilities,
  }
}

function normalizeStoredModel(raw: unknown, index: number, options?: { strictCustomPricing?: boolean }): StoredModel {
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: `models[${index}]`,
    })
  }

  const modelType = raw.type
  if (!isUnifiedModelType(modelType)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_TYPE_INVALID',
      field: `models[${index}].type`,
    })
  }

  const providerFromField = readTrimmedString(raw.provider)
  const modelIdFromField = readTrimmedString(raw.modelId)
  const modelKeyFromField = readTrimmedString(raw.modelKey)
  const parsedModelKey = parseModelKeyStrict(modelKeyFromField)

  const provider = providerFromField || parsedModelKey?.provider || ''
  const modelId = modelIdFromField || parsedModelKey?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)

  if (!modelKey) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: `models[${index}].modelKey`,
    })
  }
  if (modelKeyFromField && (!parsedModelKey || parsedModelKey.modelKey !== modelKey)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_MISMATCH',
      field: `models[${index}].modelKey`,
    })
  }

  const modelName = readTrimmedString(raw.name) || modelId

  const customPricing = normalizeCustomPricing(raw.customPricing, {
    strict: options?.strictCustomPricing,
    field: `models[${index}].customPricing`,
  })

  const llmProtocolRaw = raw.llmProtocol
  let llmProtocol: LlmProtocolType | undefined
  if (llmProtocolRaw !== undefined && llmProtocolRaw !== null) {
    if (!isLlmProtocol(llmProtocolRaw)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_LLM_PROTOCOL_INVALID',
        field: `models[${index}].llmProtocol`,
      })
    }
    llmProtocol = llmProtocolRaw
  }
  const llmProtocolCheckedAt = readTrimmedString(raw.llmProtocolCheckedAt) || undefined

  const compatMediaTemplateRaw = raw.compatMediaTemplate
  let compatMediaTemplate: OpenAICompatMediaTemplate | undefined
  if (compatMediaTemplateRaw !== undefined && compatMediaTemplateRaw !== null) {
    const validated = validateOpenAICompatMediaTemplate(compatMediaTemplateRaw)
    if (!validated.ok || !validated.template) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_COMPAT_MEDIA_TEMPLATE_INVALID',
        field: `models[${index}].compatMediaTemplate`,
      })
    }
    compatMediaTemplate = validated.template
  }
  const compatMediaTemplateCheckedAt = readTrimmedString(raw.compatMediaTemplateCheckedAt) || undefined
  const compatMediaTemplateSourceRaw = raw.compatMediaTemplateSource
  let compatMediaTemplateSource: OpenAICompatMediaTemplateSource | undefined
  if (compatMediaTemplateSourceRaw !== undefined && compatMediaTemplateSourceRaw !== null) {
    if (!isMediaTemplateSource(compatMediaTemplateSourceRaw)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_COMPAT_MEDIA_TEMPLATE_SOURCE_INVALID',
        field: `models[${index}].compatMediaTemplateSource`,
      })
    }
    compatMediaTemplateSource = compatMediaTemplateSourceRaw
  }

  return {
    modelId,
    modelKey,
    name: modelName,
    type: modelType,
    provider,
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(llmProtocolCheckedAt ? { llmProtocolCheckedAt } : {}),
    ...(compatMediaTemplate ? { compatMediaTemplate } : {}),
    ...(compatMediaTemplateCheckedAt ? { compatMediaTemplateCheckedAt } : {}),
    ...(compatMediaTemplateSource ? { compatMediaTemplateSource } : {}),
    price: 0,
    ...(customPricing ? { customPricing } : {}),
  }
}

export function normalizeModelList(rawModels: unknown): StoredModel[] {
  if (rawModels === undefined) return []
  if (!Array.isArray(rawModels)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'models',
    })
  }

  return rawModels.map((item, index) => normalizeStoredModel(item, index, { strictCustomPricing: true }))
}

export function validateModelProviderConsistency(models: StoredModel[], providers: StoredProvider[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const matchedProvider = resolveProviderByIdOrKey(providers, model.provider)
    if (!matchedProvider) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_NOT_FOUND',
        field: `models[${index}].provider`,
      })
    }
  }
}

export function validateModelProviderTypeSupport(models: StoredModel[], providers: StoredProvider[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const matchedProvider = resolveProviderByIdOrKey(providers, model.provider)
    if (!matchedProvider) continue

    const providerKey = getProviderKey(matchedProvider.id)
    if (model.type === 'lipsync' && providerKey !== 'fal' && providerKey !== 'vidu' && providerKey !== 'bailian') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_TYPE_UNSUPPORTED',
        field: `models[${index}].provider`,
      })
    }
  }
}

export function validateCustomPricingCapabilityMappings(models: StoredModel[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    if (model.type !== 'image' && model.type !== 'video') continue

    const mediaPricing = model.type === 'image'
      ? model.customPricing?.image
      : model.customPricing?.video
    const optionPrices = mediaPricing?.optionPrices
    if (!optionPrices || Object.keys(optionPrices).length === 0) continue

    const context = resolveBuiltinModelContext(model.type, model.modelKey)
    if (!context) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'CAPABILITY_MODEL_UNSUPPORTED',
        field: `models[${index}].customPricing.${model.type}.optionPrices`,
      })
    }

    const optionFields = getCapabilityOptionFields(model.type, context.capabilities)
    for (const [field, optionMap] of Object.entries(optionPrices)) {
      const allowedValues = optionFields[field]
      if (!allowedValues) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_FIELD_INVALID',
          field: `models[${index}].customPricing.${model.type}.optionPrices.${field}`,
        })
      }
      for (const optionValue of Object.keys(optionMap)) {
        if (allowedValues.includes(optionValue)) continue
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_VALUE_NOT_ALLOWED',
          field: `models[${index}].customPricing.${model.type}.optionPrices.${field}.${optionValue}`,
          allowedValues,
        })
      }
    }
  }
}



export function hasBuiltinPricingForModel(apiType: PricingApiType, provider: string, modelId: string): boolean {
  // findBuiltinPricingCatalogEntry handles providerKey stripping and alias fallback internally
  return !!findBuiltinPricingCatalogEntry(apiType, provider, modelId)
}

export function validateBillableModelPricing(models: StoredModel[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const apiType = BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE[model.type]
    if (!apiType) continue

    // Skip validation if user provided custom pricing
    if (hasCustomPricingForType(model)) continue
    if (OPTIONAL_PRICING_PROVIDER_KEYS.has(getProviderKey(model.provider))) continue

    if (!hasBuiltinPricingForModel(apiType, model.provider, model.modelId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PRICING_NOT_CONFIGURED',
        field: `models[${index}].modelId`,
        modelKey: model.modelKey,
        apiType,
      })
    }
  }
}

export function parseStoredModels(rawModels: string | null | undefined): StoredModel[] {
  if (!rawModels) return []
  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawModels)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'customModels',
    })
  }
  if (!Array.isArray(parsedUnknown)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'customModels',
    })
  }
  const normalized: StoredModel[] = []
  for (let index = 0; index < parsedUnknown.length; index += 1) {
    normalized.push(withBuiltinCapabilities(normalizeStoredModel(parsedUnknown[index], index)))
  }
  return normalized
}
ensureAiCatalogsRegistered()
