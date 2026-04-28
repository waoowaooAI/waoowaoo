/**
 * 用户 API 配置管理接口
 *
 * GET  - 读取用户配置(解密)
 * PUT  - 保存/更新配置(加密)
 */

import { prisma } from '@/lib/prisma'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto-utils'
import { ApiError } from '@/lib/api-errors'
import { composeModelKey } from '@/lib/ai-registry/selection'
import { buildApiConfigServerCatalog, DEFAULT_LIPSYNC_MODEL_KEY, getGoogleCompatibleApiConfigPresetModels } from '@/lib/ai-registry/api-config-catalog'
import { getBillingMode } from '@/lib/billing/mode'
import { normalizeWorkflowConcurrencyConfig } from '@/lib/workflow-concurrency'
import type { ApiConfigPutBody, DefaultModelsPayload, StoredModel } from './api-config-types'
import { getProviderKey, isRecord } from './api-config-shared'
import { parseStoredProviders, normalizeProvidersInput } from './api-config-provider-normalization'
import {
  normalizeModelList,
  parseStoredModels,
  validateBillableModelPricing,
  validateCustomPricingCapabilityMappings,
  validateModelProviderConsistency,
  validateModelProviderTypeSupport,
} from './api-config-model-normalization'
import {
  resolveStoredLlmProtocols,
  resolveStoredMediaTemplates,
} from './api-config-openai-compatible-models'
import {
  buildPricingDisplayMap,
  resolveBuiltinCapabilities,
  withDisplayPricing,
} from './api-config-pricing-display'
import {
  normalizeDefaultModelsInput,
  normalizeWorkflowConcurrencyInput,
  sanitizeDefaultModelsForBilling,
  sanitizeModelsForBilling,
  validateDefaultModelPricing,
} from './api-config-defaults'
import {
  normalizeCapabilitySelectionsInput,
  parseStoredCapabilitySelections,
  sanitizeCapabilitySelectionsAgainstModels,
  serializeCapabilitySelections,
  validateCapabilitySelectionsAgainstModels,
} from './api-config-capability-defaults'

export async function getUserApiConfig(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customModels: true,
      customProviders: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      audioModel: true,
      lipSyncModel: true,
      voiceDesignModel: true,
      capabilityDefaults: true,
      analysisConcurrency: true,
      imageConcurrency: true,
      videoConcurrency: true,
    },
  })

  const providers = parseStoredProviders(pref?.customProviders).map((provider) => ({
    ...provider,
    apiKey: provider.apiKey ? decryptApiKey(provider.apiKey) : '',
  }))

  const billingMode = await getBillingMode()
  const parsedModels = parseStoredModels(pref?.customModels)
  const models = billingMode === 'OFF' ? parsedModels : sanitizeModelsForBilling(parsedModels)
  const pricingDisplay = buildPricingDisplayMap()
  const pricedModels = models.map((model) => withDisplayPricing(model, pricingDisplay))

  const savedModelKeys = new Set(pricedModels.map((m) => m.modelKey))
  const disabledPresets: (StoredModel & { enabled: false })[] = []
  for (const p of providers) {
    if (getProviderKey(p.id) !== 'gemini-compatible') continue
    for (const preset of getGoogleCompatibleApiConfigPresetModels(p.id)) {
      const modelKey = composeModelKey(p.id, preset.modelId)
      if (!modelKey || savedModelKeys.has(modelKey)) continue
      savedModelKeys.add(modelKey)
      const base: StoredModel = {
        modelId: preset.modelId,
        modelKey,
        name: preset.name,
        type: preset.type,
        provider: p.id,
        price: 0,
        // alias 回退自动从 google catalog 获取 capabilities
        capabilities: resolveBuiltinCapabilities(preset.type, p.id, preset.modelId),
      }
      disabledPresets.push({ ...withDisplayPricing(base, pricingDisplay), enabled: false })
    }
  }

  const rawDefaults: DefaultModelsPayload = {
    analysisModel: pref?.analysisModel || '',
    characterModel: pref?.characterModel || '',
    locationModel: pref?.locationModel || '',
    storyboardModel: pref?.storyboardModel || '',
    editModel: pref?.editModel || '',
    videoModel: pref?.videoModel || '',
    audioModel: pref?.audioModel || '',
    lipSyncModel: pref?.lipSyncModel || DEFAULT_LIPSYNC_MODEL_KEY,
    voiceDesignModel: pref?.voiceDesignModel || '',
  }
  const defaultModels = billingMode === 'OFF'
    ? rawDefaults
    : sanitizeDefaultModelsForBilling(rawDefaults)
  const capabilityDefaults = sanitizeCapabilitySelectionsAgainstModels(
    parseStoredCapabilitySelections(pref?.capabilityDefaults, 'capabilityDefaults'),
    [...models, ...disabledPresets],
  )
  const workflowConcurrency = normalizeWorkflowConcurrencyConfig({
    analysis: pref?.analysisConcurrency,
    image: pref?.imageConcurrency,
    video: pref?.videoConcurrency,
  })

  return {
    models: [...pricedModels, ...disabledPresets],
    providers,
    catalog: buildApiConfigServerCatalog({
      resolveCapabilities: (model) => resolveBuiltinCapabilities(model.type, model.provider, model.modelId),
    }),
    defaultModels,
    capabilityDefaults,
    workflowConcurrency,
    pricingDisplay,
  }
}

export async function putUserApiConfig(userId: string, body: unknown) {
  if (!isRecord(body)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }
  const payload = body as ApiConfigPutBody

  const normalizedModelsInput = payload.models === undefined ? undefined : normalizeModelList(payload.models)
  const normalizedProviders = payload.providers === undefined ? undefined : normalizeProvidersInput(payload.providers)
  const normalizedDefaults = payload.defaultModels === undefined ? undefined : normalizeDefaultModelsInput(payload.defaultModels)
  const normalizedCapabilityDefaults = payload.capabilityDefaults === undefined
    ? undefined
    : normalizeCapabilitySelectionsInput(payload.capabilityDefaults)
  const normalizedWorkflowConcurrency = payload.workflowConcurrency === undefined
    ? undefined
    : normalizeWorkflowConcurrencyInput(payload.workflowConcurrency)
  const billingMode = await getBillingMode()

  const updateData: Record<string, unknown> = {}
  const existingPref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customProviders: true,
      customModels: true,
    },
  })
  const existingProviders = parseStoredProviders(existingPref?.customProviders)
  const existingModels = parseStoredModels(existingPref?.customModels)
  const normalizedModels = normalizedModelsInput === undefined
    ? undefined
    : resolveStoredMediaTemplates(resolveStoredLlmProtocols(normalizedModelsInput, existingModels), existingModels)

  const providerSourceForValidation = normalizedProviders ?? existingProviders
  if (normalizedModels !== undefined) {
    validateModelProviderConsistency(normalizedModels, providerSourceForValidation)
    validateModelProviderTypeSupport(normalizedModels, providerSourceForValidation)
    validateCustomPricingCapabilityMappings(normalizedModels)
    if (billingMode !== 'OFF') {
      validateBillableModelPricing(normalizedModels)
    }
  }

  if (normalizedModels !== undefined) {
    updateData.customModels = JSON.stringify(normalizedModels)
  }

  if (normalizedProviders !== undefined) {
    const providersToSave = normalizedProviders.map((provider) => {
      const existing = existingProviders.find((candidate) => candidate.id === provider.id)
      let finalApiKey: string | undefined
      if (provider.apiKey === undefined) {
        finalApiKey = existing?.apiKey
      } else if (provider.apiKey === '') {
        finalApiKey = undefined
      } else {
        finalApiKey = encryptApiKey(provider.apiKey)
      }
      const finalHidden = provider.hidden === undefined
        ? existing?.hidden === true
        : provider.hidden === true

      return {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        hidden: finalHidden,
        apiMode: provider.apiMode,
        gatewayRoute: provider.gatewayRoute,
        apiKey: finalApiKey,
      }
    })
    updateData.customProviders = JSON.stringify(providersToSave)
  }

  if (normalizedDefaults !== undefined) {
    if (billingMode !== 'OFF') {
      validateDefaultModelPricing(normalizedDefaults)
    }
    if (normalizedDefaults.analysisModel !== undefined) {
      updateData.analysisModel = normalizedDefaults.analysisModel || null
    }
    if (normalizedDefaults.characterModel !== undefined) {
      updateData.characterModel = normalizedDefaults.characterModel || null
    }
    if (normalizedDefaults.locationModel !== undefined) {
      updateData.locationModel = normalizedDefaults.locationModel || null
    }
    if (normalizedDefaults.storyboardModel !== undefined) {
      updateData.storyboardModel = normalizedDefaults.storyboardModel || null
    }
    if (normalizedDefaults.editModel !== undefined) {
      updateData.editModel = normalizedDefaults.editModel || null
    }
    if (normalizedDefaults.videoModel !== undefined) {
      updateData.videoModel = normalizedDefaults.videoModel || null
    }
    if (normalizedDefaults.audioModel !== undefined) {
      updateData.audioModel = normalizedDefaults.audioModel || null
    }
    if (normalizedDefaults.lipSyncModel !== undefined) {
      updateData.lipSyncModel = normalizedDefaults.lipSyncModel || null
    }
    if (normalizedDefaults.voiceDesignModel !== undefined) {
      updateData.voiceDesignModel = normalizedDefaults.voiceDesignModel || null
    }
  }

  if (normalizedWorkflowConcurrency !== undefined) {
    if (normalizedWorkflowConcurrency.analysis !== undefined) {
      updateData.analysisConcurrency = normalizedWorkflowConcurrency.analysis
    }
    if (normalizedWorkflowConcurrency.image !== undefined) {
      updateData.imageConcurrency = normalizedWorkflowConcurrency.image
    }
    if (normalizedWorkflowConcurrency.video !== undefined) {
      updateData.videoConcurrency = normalizedWorkflowConcurrency.video
    }
  }

  if (normalizedCapabilityDefaults !== undefined) {
    const modelSource = normalizedModels ?? existingModels
    const cleanedCapabilityDefaults = sanitizeCapabilitySelectionsAgainstModels(
      normalizedCapabilityDefaults,
      modelSource,
    )
    validateCapabilitySelectionsAgainstModels(cleanedCapabilityDefaults, modelSource)
    updateData.capabilityDefaults = serializeCapabilitySelections(cleanedCapabilityDefaults)
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: updateData,
    create: { userId, ...updateData },
  })

  return { success: true }
}
