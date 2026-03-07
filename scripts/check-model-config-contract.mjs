let prisma

const STRICT = process.argv.includes('--strict')
const MODEL_FIELDS = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
]
const MAX_SAMPLES = 200
const CAPABILITY_NAMESPACES = new Set(['llm', 'image', 'video', 'audio', 'lipsync'])
const MODEL_TYPES = new Set(['llm', 'image', 'video', 'audio', 'lipsync'])
const CAPABILITY_NAMESPACE_ALLOWED_FIELDS = {
  llm: new Set(['reasoningEffortOptions', 'fieldI18n']),
  image: new Set(['resolutionOptions', 'fieldI18n']),
  video: new Set([
    'durationOptions',
    'fpsOptions',
    'resolutionOptions',
    'firstlastframe',
    'supportGenerateAudio',
    'fieldI18n',
  ]),
  audio: new Set(['voiceOptions', 'rateOptions', 'fieldI18n']),
  lipsync: new Set(['modeOptions', 'fieldI18n']),
}

const CAPABILITY_NAMESPACE_I18N_FIELDS = {
  llm: {
    reasoningEffort: 'reasoningEffortOptions',
  },
  image: {
    resolution: 'resolutionOptions',
  },
  video: {
    duration: 'durationOptions',
    fps: 'fpsOptions',
    resolution: 'resolutionOptions',
  },
  audio: {
    voice: 'voiceOptions',
    rate: 'rateOptions',
  },
  lipsync: {
    mode: 'modeOptions',
  },
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item))
}

function isNumberArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function parseModelKeyStrict(value) {
  if (!isNonEmptyString(value)) return null
  const raw = value.trim()
  const marker = raw.indexOf('::')
  if (marker === -1) return null
  const provider = raw.slice(0, marker).trim()
  const modelId = raw.slice(marker + 2).trim()
  if (!provider || !modelId) return null
  return {
    provider,
    modelId,
    modelKey: `${provider}::${modelId}`,
  }
}

function addSample(summary, sample) {
  if (summary.samples.length >= MAX_SAMPLES) return
  summary.samples.push(sample)
}

function pushIssue(issues, field, message) {
  issues.push({ field, message })
}

function isI18nKey(value) {
  return isNonEmptyString(value) && value.includes('.')
}

function validateAllowedFields(issues, namespace, namespaceValue) {
  if (!isRecord(namespaceValue)) return
  const allowedFields = CAPABILITY_NAMESPACE_ALLOWED_FIELDS[namespace]
  for (const field of Object.keys(namespaceValue)) {
    if (allowedFields.has(field)) continue
    if (field === 'i18n') {
      pushIssue(issues, `capabilities.${namespace}.${field}`, 'use fieldI18n instead of i18n')
      continue
    }
    pushIssue(issues, `capabilities.${namespace}.${field}`, `unknown capability field: ${field}`)
  }
}

function validateFieldI18nMap(issues, namespace, namespaceValue) {
  if (!isRecord(namespaceValue)) return
  if (namespaceValue.fieldI18n === undefined) return
  if (!isRecord(namespaceValue.fieldI18n)) {
    pushIssue(issues, `capabilities.${namespace}.fieldI18n`, 'fieldI18n must be an object')
    return
  }

  const allowedI18nFields = CAPABILITY_NAMESPACE_I18N_FIELDS[namespace]
  for (const [fieldName, fieldConfig] of Object.entries(namespaceValue.fieldI18n)) {
    if (!(fieldName in allowedI18nFields)) {
      pushIssue(
        issues,
        `capabilities.${namespace}.fieldI18n.${fieldName}`,
        `unknown i18n field: ${fieldName}`,
      )
      continue
    }
    if (!isRecord(fieldConfig)) {
      pushIssue(
        issues,
        `capabilities.${namespace}.fieldI18n.${fieldName}`,
        'field i18n config must be an object',
      )
      continue
    }

    if (fieldConfig.labelKey !== undefined && !isI18nKey(fieldConfig.labelKey)) {
      pushIssue(
        issues,
        `capabilities.${namespace}.fieldI18n.${fieldName}.labelKey`,
        'labelKey must be an i18n key',
      )
    }
    if (fieldConfig.unitKey !== undefined && !isI18nKey(fieldConfig.unitKey)) {
      pushIssue(
        issues,
        `capabilities.${namespace}.fieldI18n.${fieldName}.unitKey`,
        'unitKey must be an i18n key',
      )
    }
    if (fieldConfig.optionLabelKeys !== undefined) {
      if (!isRecord(fieldConfig.optionLabelKeys)) {
        pushIssue(
          issues,
          `capabilities.${namespace}.fieldI18n.${fieldName}.optionLabelKeys`,
          'optionLabelKeys must be an object',
        )
        continue
      }

      const optionFieldName = allowedI18nFields[fieldName]
      const allowedOptionsRaw = namespaceValue[optionFieldName]
      const allowedOptions = Array.isArray(allowedOptionsRaw)
        ? new Set(allowedOptionsRaw.map((value) => String(value)))
        : null

      for (const [optionValue, optionLabelKey] of Object.entries(fieldConfig.optionLabelKeys)) {
        if (!isI18nKey(optionLabelKey)) {
          pushIssue(
            issues,
            `capabilities.${namespace}.fieldI18n.${fieldName}.optionLabelKeys.${optionValue}`,
            'option label must be an i18n key',
          )
        }
        if (allowedOptions && !allowedOptions.has(optionValue)) {
          pushIssue(
            issues,
            `capabilities.${namespace}.fieldI18n.${fieldName}.optionLabelKeys.${optionValue}`,
            `option ${optionValue} is not defined in ${optionFieldName}`,
          )
        }
      }
    }
  }
}

function validateCapabilities(modelType, capabilities) {
  const issues = []
  if (!MODEL_TYPES.has(modelType)) {
    pushIssue(issues, 'type', 'type must be llm/image/video/audio/lipsync')
    return issues
  }
  if (capabilities === undefined || capabilities === null) return issues
  if (!isRecord(capabilities)) {
    pushIssue(issues, 'capabilities', 'capabilities must be an object')
    return issues
  }

  for (const namespace of Object.keys(capabilities)) {
    if (!CAPABILITY_NAMESPACES.has(namespace)) {
      pushIssue(issues, `capabilities.${namespace}`, `unknown capabilities namespace: ${namespace}`)
      continue
    }
    if (namespace !== modelType) {
      pushIssue(issues, `capabilities.${namespace}`, `namespace ${namespace} is not allowed for model type ${modelType}`)
    }
  }

  const llm = capabilities.llm
  if (llm !== undefined) {
    if (!isRecord(llm)) {
      pushIssue(issues, 'capabilities.llm', 'llm capabilities must be an object')
    } else {
      validateAllowedFields(issues, 'llm', llm)
      if (llm.reasoningEffortOptions !== undefined && !isStringArray(llm.reasoningEffortOptions)) {
        pushIssue(issues, 'capabilities.llm.reasoningEffortOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, 'llm', llm)
    }
  }

  const image = capabilities.image
  if (image !== undefined) {
    if (!isRecord(image)) {
      pushIssue(issues, 'capabilities.image', 'image capabilities must be an object')
    } else {
      validateAllowedFields(issues, 'image', image)
      if (image.resolutionOptions !== undefined && !isStringArray(image.resolutionOptions)) {
        pushIssue(issues, 'capabilities.image.resolutionOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, 'image', image)
    }
  }

  const video = capabilities.video
  if (video !== undefined) {
    if (!isRecord(video)) {
      pushIssue(issues, 'capabilities.video', 'video capabilities must be an object')
    } else {
      validateAllowedFields(issues, 'video', video)
      if (video.durationOptions !== undefined && !isNumberArray(video.durationOptions)) {
        pushIssue(issues, 'capabilities.video.durationOptions', 'must be number array')
      }
      if (video.fpsOptions !== undefined && !isNumberArray(video.fpsOptions)) {
        pushIssue(issues, 'capabilities.video.fpsOptions', 'must be number array')
      }
      if (video.resolutionOptions !== undefined && !isStringArray(video.resolutionOptions)) {
        pushIssue(issues, 'capabilities.video.resolutionOptions', 'must be string array')
      }
      if (video.supportGenerateAudio !== undefined && typeof video.supportGenerateAudio !== 'boolean') {
        pushIssue(issues, 'capabilities.video.supportGenerateAudio', 'must be boolean')
      }
      if (video.firstlastframe !== undefined && typeof video.firstlastframe !== 'boolean') {
        pushIssue(issues, 'capabilities.video.firstlastframe', 'must be boolean')
      }
      validateFieldI18nMap(issues, 'video', video)
    }
  }

  const audio = capabilities.audio
  if (audio !== undefined) {
    if (!isRecord(audio)) {
      pushIssue(issues, 'capabilities.audio', 'audio capabilities must be an object')
    } else {
      validateAllowedFields(issues, 'audio', audio)
      if (audio.voiceOptions !== undefined && !isStringArray(audio.voiceOptions)) {
        pushIssue(issues, 'capabilities.audio.voiceOptions', 'must be string array')
      }
      if (audio.rateOptions !== undefined && !isStringArray(audio.rateOptions)) {
        pushIssue(issues, 'capabilities.audio.rateOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, 'audio', audio)
    }
  }

  const lipsync = capabilities.lipsync
  if (lipsync !== undefined) {
    if (!isRecord(lipsync)) {
      pushIssue(issues, 'capabilities.lipsync', 'lipsync capabilities must be an object')
    } else {
      validateAllowedFields(issues, 'lipsync', lipsync)
      if (lipsync.modeOptions !== undefined && !isStringArray(lipsync.modeOptions)) {
        pushIssue(issues, 'capabilities.lipsync.modeOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, 'lipsync', lipsync)
    }
  }

  return issues
}

async function main() {
  let PrismaClient
  try {
    ({ PrismaClient } = await import('@prisma/client'))
  } catch {
    throw new Error('MISSING_DEPENDENCY: @prisma/client is not installed, run npm install first')
  }

  prisma = new PrismaClient()
  const summary = {
    generatedAt: new Date().toISOString(),
    userPreference: {
      total: 0,
      invalidModelKeyFields: 0,
      invalidCustomModelsJson: 0,
      invalidCustomModelShape: 0,
      invalidCapabilities: 0,
    },
    novelPromotionProject: {
      total: 0,
      invalidModelKeyFields: 0,
    },
    samples: [],
  }

  const userPrefs = await prisma.userPreference.findMany({
    select: {
      id: true,
      customModels: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
    },
  })

  for (const pref of userPrefs) {
    summary.userPreference.total += 1
    for (const field of MODEL_FIELDS) {
      const rawValue = pref[field]
      if (!rawValue) continue
      if (!parseModelKeyStrict(rawValue)) {
        summary.userPreference.invalidModelKeyFields += 1
        addSample(summary, {
          table: 'userPreference',
          rowId: pref.id,
          field,
          reason: 'model field is not provider::modelId',
        })
      }
    }

    if (!pref.customModels) continue
    let parsedCustomModels
    try {
      parsedCustomModels = JSON.parse(pref.customModels)
    } catch {
      summary.userPreference.invalidCustomModelsJson += 1
      addSample(summary, {
        table: 'userPreference',
        rowId: pref.id,
        field: 'customModels',
        reason: 'invalid JSON',
      })
      continue
    }
    if (!Array.isArray(parsedCustomModels)) {
      summary.userPreference.invalidCustomModelsJson += 1
      addSample(summary, {
        table: 'userPreference',
        rowId: pref.id,
        field: 'customModels',
        reason: 'customModels is not array',
      })
      continue
    }

    for (let index = 0; index < parsedCustomModels.length; index += 1) {
      const modelRaw = parsedCustomModels[index]
      if (!isRecord(modelRaw)) {
        summary.userPreference.invalidCustomModelShape += 1
        addSample(summary, {
          table: 'userPreference',
          rowId: pref.id,
          field: `customModels[${index}]`,
          reason: 'model item is not object',
        })
        continue
      }

      const modelKey = isNonEmptyString(modelRaw.modelKey) ? modelRaw.modelKey.trim() : ''
      const provider = isNonEmptyString(modelRaw.provider) ? modelRaw.provider.trim() : ''
      const modelId = isNonEmptyString(modelRaw.modelId) ? modelRaw.modelId.trim() : ''
      const parsed = parseModelKeyStrict(modelKey)
      if (!parsed || parsed.provider !== provider || parsed.modelId !== modelId) {
        summary.userPreference.invalidCustomModelShape += 1
        addSample(summary, {
          table: 'userPreference',
          rowId: pref.id,
          field: `customModels[${index}].modelKey`,
          reason: 'modelKey/provider/modelId mismatch',
        })
      }

      const modelType = isNonEmptyString(modelRaw.type) ? modelRaw.type.trim() : ''
      const capabilityIssues = validateCapabilities(modelType, modelRaw.capabilities)
      if (capabilityIssues.length > 0) {
        summary.userPreference.invalidCapabilities += 1
        addSample(summary, {
          table: 'userPreference',
          rowId: pref.id,
          field: capabilityIssues[0].field,
          reason: capabilityIssues[0].message,
        })
      }
    }
  }

  const projects = await prisma.novelPromotionProject.findMany({
    select: {
      id: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
    },
  })

  for (const project of projects) {
    summary.novelPromotionProject.total += 1
    for (const field of MODEL_FIELDS) {
      const rawValue = project[field]
      if (!rawValue) continue
      if (!parseModelKeyStrict(rawValue)) {
        summary.novelPromotionProject.invalidModelKeyFields += 1
        addSample(summary, {
          table: 'novelPromotionProject',
          rowId: project.id,
          field,
          reason: 'model field is not provider::modelId',
        })
      }
    }
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)

  if (!STRICT) return
  const hasViolations = summary.userPreference.invalidModelKeyFields > 0
    || summary.userPreference.invalidCustomModelsJson > 0
    || summary.userPreference.invalidCustomModelShape > 0
    || summary.userPreference.invalidCapabilities > 0
    || summary.novelPromotionProject.invalidModelKeyFields > 0

  if (hasViolations) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    process.stderr.write(`[check-model-config-contract] failed: ${String(error)}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect()
    }
  })
