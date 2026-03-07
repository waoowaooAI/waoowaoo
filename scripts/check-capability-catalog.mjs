import { promises as fs } from 'node:fs'
import path from 'node:path'

 const CATALOG_DIR = path.resolve(process.cwd(), 'standards/capabilities')
const CAPABILITY_NAMESPACES = new Set(['llm', 'image', 'video', 'audio', 'lipsync'])
const CAPABILITY_NAMESPACE_ALLOWED_FIELDS = {
  llm: new Set(['reasoningEffortOptions', 'fieldI18n']),
  image: new Set(['resolutionOptions', 'fieldI18n']),
  video: new Set([
    'generationModeOptions',
    'generateAudioOptions',
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
  llm: { reasoningEffort: 'reasoningEffortOptions' },
  image: { resolution: 'resolutionOptions' },
  video: {
    generationMode: 'generationModeOptions',
    generateAudio: 'generateAudioOptions',
    duration: 'durationOptions',
    fps: 'fpsOptions',
    resolution: 'resolutionOptions',
  },
  audio: { voice: 'voiceOptions', rate: 'rateOptions' },
  lipsync: { mode: 'modeOptions' },
}
const MODEL_TYPES = new Set(['llm', 'image', 'video', 'audio', 'lipsync'])

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isI18nKey(value) {
  return isNonEmptyString(value) && value.includes('.')
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item))
}

function isNumberArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isBooleanArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
}

function parseModelKeyStrict(value) {
  if (!isNonEmptyString(value)) return null
  const raw = value.trim()
  const marker = raw.indexOf('::')
  if (marker === -1) return null
  const provider = raw.slice(0, marker).trim()
  const modelId = raw.slice(marker + 2).trim()
  if (!provider || !modelId) return null
  return { provider, modelId, modelKey: `${provider}::${modelId}` }
}

function pushIssue(issues, file, index, field, message) {
  issues.push({ file, index, field, message })
}

function validateAllowedFields(issues, file, index, namespace, namespaceValue) {
  if (!isRecord(namespaceValue)) return
  const allowedFields = CAPABILITY_NAMESPACE_ALLOWED_FIELDS[namespace]
  for (const field of Object.keys(namespaceValue)) {
    if (allowedFields.has(field)) continue
    if (field === 'i18n') {
      pushIssue(issues, file, index, `capabilities.${namespace}.${field}`, 'use fieldI18n instead of i18n')
      continue
    }
    pushIssue(issues, file, index, `capabilities.${namespace}.${field}`, `unknown capability field: ${field}`)
  }
}

function validateFieldI18nMap(issues, file, index, namespace, namespaceValue) {
  if (!isRecord(namespaceValue)) return
  if (namespaceValue.fieldI18n === undefined) return
  if (!isRecord(namespaceValue.fieldI18n)) {
    pushIssue(issues, file, index, `capabilities.${namespace}.fieldI18n`, 'fieldI18n must be an object')
    return
  }

  const allowedI18nFields = CAPABILITY_NAMESPACE_I18N_FIELDS[namespace]
  for (const [fieldName, fieldConfig] of Object.entries(namespaceValue.fieldI18n)) {
    if (!(fieldName in allowedI18nFields)) {
      pushIssue(issues, file, index, `capabilities.${namespace}.fieldI18n.${fieldName}`, `unknown i18n field: ${fieldName}`)
      continue
    }
    if (!isRecord(fieldConfig)) {
      pushIssue(issues, file, index, `capabilities.${namespace}.fieldI18n.${fieldName}`, 'field i18n config must be an object')
      continue
    }

    if (fieldConfig.labelKey !== undefined && !isI18nKey(fieldConfig.labelKey)) {
      pushIssue(issues, file, index, `capabilities.${namespace}.fieldI18n.${fieldName}.labelKey`, 'labelKey must be an i18n key')
    }
    if (fieldConfig.unitKey !== undefined && !isI18nKey(fieldConfig.unitKey)) {
      pushIssue(issues, file, index, `capabilities.${namespace}.fieldI18n.${fieldName}.unitKey`, 'unitKey must be an i18n key')
    }
    if (fieldConfig.optionLabelKeys !== undefined) {
      if (!isRecord(fieldConfig.optionLabelKeys)) {
        pushIssue(
          issues,
          file,
          index,
          `capabilities.${namespace}.fieldI18n.${fieldName}.optionLabelKeys`,
          'optionLabelKeys must be an object',
        )
        continue
      }
      const optionFieldName = allowedI18nFields[fieldName]
      const optionsRaw = namespaceValue[optionFieldName]
      const allowedOptions = Array.isArray(optionsRaw) ? new Set(optionsRaw.map((value) => String(value))) : null
      for (const [optionValue, optionLabel] of Object.entries(fieldConfig.optionLabelKeys)) {
        if (!isI18nKey(optionLabel)) {
          pushIssue(
            issues,
            file,
            index,
            `capabilities.${namespace}.fieldI18n.${fieldName}.optionLabelKeys.${optionValue}`,
            'option label must be an i18n key',
          )
        }
        if (allowedOptions && !allowedOptions.has(optionValue)) {
          pushIssue(
            issues,
            file,
            index,
            `capabilities.${namespace}.fieldI18n.${fieldName}.optionLabelKeys.${optionValue}`,
            `option ${optionValue} is not defined in ${optionFieldName}`,
          )
        }
      }
    }
  }
}

function validateCapabilitiesForModelType(issues, file, index, modelType, capabilities) {
  if (capabilities === undefined || capabilities === null) return
  if (!isRecord(capabilities)) {
    pushIssue(issues, file, index, 'capabilities', 'capabilities must be an object')
    return
  }

  const expectedNamespace = modelType
  for (const namespace of Object.keys(capabilities)) {
    if (!CAPABILITY_NAMESPACES.has(namespace)) {
      pushIssue(issues, file, index, `capabilities.${namespace}`, `unknown capabilities namespace: ${namespace}`)
      continue
    }
    if (namespace !== expectedNamespace) {
      pushIssue(
        issues,
        file,
        index,
        `capabilities.${namespace}`,
        `namespace ${namespace} is not allowed for model type ${modelType}`,
      )
    }
  }

  const llm = capabilities.llm
  if (llm !== undefined) {
    if (!isRecord(llm)) {
      pushIssue(issues, file, index, 'capabilities.llm', 'llm capabilities must be an object')
    } else {
      validateAllowedFields(issues, file, index, 'llm', llm)
      if (llm.reasoningEffortOptions !== undefined && !isStringArray(llm.reasoningEffortOptions)) {
        pushIssue(issues, file, index, 'capabilities.llm.reasoningEffortOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, file, index, 'llm', llm)
    }
  }

  const image = capabilities.image
  if (image !== undefined) {
    if (!isRecord(image)) {
      pushIssue(issues, file, index, 'capabilities.image', 'image capabilities must be an object')
    } else {
      validateAllowedFields(issues, file, index, 'image', image)
      if (image.resolutionOptions !== undefined && !isStringArray(image.resolutionOptions)) {
        pushIssue(issues, file, index, 'capabilities.image.resolutionOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, file, index, 'image', image)
    }
  }

  const video = capabilities.video
  if (video !== undefined) {
    if (!isRecord(video)) {
      pushIssue(issues, file, index, 'capabilities.video', 'video capabilities must be an object')
    } else {
      validateAllowedFields(issues, file, index, 'video', video)
      if (video.generationModeOptions !== undefined && !isStringArray(video.generationModeOptions)) {
        pushIssue(issues, file, index, 'capabilities.video.generationModeOptions', 'must be string array')
      }
      if (video.generateAudioOptions !== undefined && !isBooleanArray(video.generateAudioOptions)) {
        pushIssue(issues, file, index, 'capabilities.video.generateAudioOptions', 'must be boolean array')
      }
      if (video.durationOptions !== undefined && !isNumberArray(video.durationOptions)) {
        pushIssue(issues, file, index, 'capabilities.video.durationOptions', 'must be number array')
      }
      if (video.fpsOptions !== undefined && !isNumberArray(video.fpsOptions)) {
        pushIssue(issues, file, index, 'capabilities.video.fpsOptions', 'must be number array')
      }
      if (video.resolutionOptions !== undefined && !isStringArray(video.resolutionOptions)) {
        pushIssue(issues, file, index, 'capabilities.video.resolutionOptions', 'must be string array')
      }
      if (video.supportGenerateAudio !== undefined && typeof video.supportGenerateAudio !== 'boolean') {
        pushIssue(issues, file, index, 'capabilities.video.supportGenerateAudio', 'must be boolean')
      }
      if (video.firstlastframe !== undefined && typeof video.firstlastframe !== 'boolean') {
        pushIssue(issues, file, index, 'capabilities.video.firstlastframe', 'must be boolean')
      }
      validateFieldI18nMap(issues, file, index, 'video', video)
    }
  }

  const audio = capabilities.audio
  if (audio !== undefined) {
    if (!isRecord(audio)) {
      pushIssue(issues, file, index, 'capabilities.audio', 'audio capabilities must be an object')
    } else {
      validateAllowedFields(issues, file, index, 'audio', audio)
      if (audio.voiceOptions !== undefined && !isStringArray(audio.voiceOptions)) {
        pushIssue(issues, file, index, 'capabilities.audio.voiceOptions', 'must be string array')
      }
      if (audio.rateOptions !== undefined && !isStringArray(audio.rateOptions)) {
        pushIssue(issues, file, index, 'capabilities.audio.rateOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, file, index, 'audio', audio)
    }
  }

  const lipsync = capabilities.lipsync
  if (lipsync !== undefined) {
    if (!isRecord(lipsync)) {
      pushIssue(issues, file, index, 'capabilities.lipsync', 'lipsync capabilities must be an object')
    } else {
      validateAllowedFields(issues, file, index, 'lipsync', lipsync)
      if (lipsync.modeOptions !== undefined && !isStringArray(lipsync.modeOptions)) {
        pushIssue(issues, file, index, 'capabilities.lipsync.modeOptions', 'must be string array')
      }
      validateFieldI18nMap(issues, file, index, 'lipsync', lipsync)
    }
  }
}

async function listCatalogFiles() {
  const entries = await fs.readdir(CATALOG_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(CATALOG_DIR, entry.name))
}

async function readCatalog(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`catalog must be an array: ${filePath}`)
  }
  return parsed
}

async function main() {
  const issues = []
  const files = await listCatalogFiles()
  if (files.length === 0) {
    throw new Error(`no catalog files found in ${CATALOG_DIR}`)
  }

  for (const filePath of files) {
    const catalogItems = await readCatalog(filePath)
    for (let index = 0; index < catalogItems.length; index += 1) {
      const item = catalogItems[index]
      if (!isRecord(item)) {
        pushIssue(issues, filePath, index, 'entry', 'entry must be an object')
        continue
      }

      if (!isNonEmptyString(item.modelType) || !MODEL_TYPES.has(item.modelType)) {
        pushIssue(issues, filePath, index, 'modelType', 'modelType must be llm/image/video/audio/lipsync')
        continue
      }

      if (!isNonEmptyString(item.provider)) {
        pushIssue(issues, filePath, index, 'provider', 'provider must be a non-empty string')
      }
      if (!isNonEmptyString(item.modelId)) {
        pushIssue(issues, filePath, index, 'modelId', 'modelId must be a non-empty string')
      }

      const modelKey = `${item.provider || ''}::${item.modelId || ''}`
      if (!parseModelKeyStrict(modelKey)) {
        pushIssue(issues, filePath, index, 'modelKey', 'provider/modelId must compose a valid provider::modelId')
      }

      validateCapabilitiesForModelType(issues, filePath, index, item.modelType, item.capabilities)
    }
  }

  if (issues.length === 0) {
    process.stdout.write(`[check-capability-catalog] OK (${files.length} files)\n`)
    return
  }

  const maxPrint = 50
  for (const issue of issues.slice(0, maxPrint)) {
    process.stdout.write(`[check-capability-catalog] ${issue.file}#${issue.index} ${issue.field}: ${issue.message}\n`)
  }
  if (issues.length > maxPrint) {
    process.stdout.write(`[check-capability-catalog] ... ${issues.length - maxPrint} more issues\n`)
  }
  process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`[check-capability-catalog] failed: ${String(error)}\n`)
  process.exitCode = 1
})
