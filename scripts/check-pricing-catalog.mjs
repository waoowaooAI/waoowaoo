import { promises as fs } from 'node:fs'
import path from 'node:path'

const CATALOG_DIR = path.resolve(process.cwd(), 'standards/pricing')
const CAPABILITY_CATALOG_FILE = path.resolve(process.cwd(), 'standards/capabilities/image-video.catalog.json')
const API_TYPES = new Set(['text', 'image', 'video', 'voice', 'voice-design', 'lip-sync'])
const PRICING_MODES = new Set(['flat', 'capability'])
const TEXT_TOKEN_TYPES = new Set(['input', 'output'])

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isCapabilityValue(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function pushIssue(issues, file, index, field, message) {
  issues.push({ file, index, field, message })
}

function getProviderKey(providerId) {
  const marker = providerId.indexOf(':')
  return marker === -1 ? providerId : providerId.slice(0, marker)
}

function buildModelKey(modelType, provider, modelId) {
  return `${modelType}::${provider}::${modelId}`
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

async function readCapabilityCatalog() {
  const raw = await fs.readFile(CAPABILITY_CATALOG_FILE, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`capability catalog must be an array: ${CAPABILITY_CATALOG_FILE}`)
  }
  return parsed
}

function extractCapabilityOptionFields(modelType, capabilities) {
  if (!isRecord(capabilities)) return new Set()
  const namespace = capabilities[modelType]
  if (!isRecord(namespace)) return new Set()

  const fields = new Set()
  for (const [key, value] of Object.entries(namespace)) {
    if (!key.endsWith('Options')) continue
    if (!Array.isArray(value) || value.length === 0) continue
    const field = key.slice(0, -'Options'.length)
    fields.add(field)
  }
  return fields
}

function buildCapabilityOptionFieldMap(capabilityEntries) {
  const map = new Map()
  for (const entry of capabilityEntries) {
    if (!isRecord(entry)) continue
    const modelType = typeof entry.modelType === 'string' ? entry.modelType.trim() : ''
    const provider = typeof entry.provider === 'string' ? entry.provider.trim() : ''
    const modelId = typeof entry.modelId === 'string' ? entry.modelId.trim() : ''
    if (!modelType || !provider || !modelId) continue

    const fields = extractCapabilityOptionFields(modelType, entry.capabilities)
    map.set(buildModelKey(modelType, provider, modelId), fields)
    const providerKey = getProviderKey(provider)
    const fallbackKey = buildModelKey(modelType, providerKey, modelId)
    if (!map.has(fallbackKey)) {
      map.set(fallbackKey, fields)
    }
  }
  return map
}

function validateTier(issues, file, index, tier, tierIndex) {
  if (!isRecord(tier)) {
    pushIssue(issues, file, index, `pricing.tiers[${tierIndex}]`, 'tier must be object')
    return
  }

  if (!isRecord(tier.when) || Object.keys(tier.when).length === 0) {
    pushIssue(issues, file, index, `pricing.tiers[${tierIndex}].when`, 'when must be non-empty object')
  } else {
    for (const [field, value] of Object.entries(tier.when)) {
      if (!isCapabilityValue(value)) {
        pushIssue(
          issues,
          file,
          index,
          `pricing.tiers[${tierIndex}].when.${field}`,
          'condition value must be string/number/boolean',
        )
      }
    }
  }

  if (!isFiniteNumber(tier.amount) || tier.amount < 0) {
    pushIssue(issues, file, index, `pricing.tiers[${tierIndex}].amount`, 'amount must be finite number >= 0')
  }
}

function validateTextCapabilityTiers(issues, file, index, tiers) {
  const seenTokenTypes = new Set()

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
    const tier = tiers[tierIndex]
    if (!isRecord(tier) || !isRecord(tier.when)) continue

    const whenFields = Object.keys(tier.when)
    if (whenFields.length !== 1 || whenFields[0] !== 'tokenType') {
      pushIssue(issues, file, index, `pricing.tiers[${tierIndex}].when`, 'text capability tier must only contain tokenType')
      continue
    }

    const tokenType = tier.when.tokenType
    if (typeof tokenType !== 'string' || !TEXT_TOKEN_TYPES.has(tokenType)) {
      pushIssue(issues, file, index, `pricing.tiers[${tierIndex}].when.tokenType`, 'tokenType must be input or output')
      continue
    }

    if (seenTokenTypes.has(tokenType)) {
      pushIssue(issues, file, index, `pricing.tiers[${tierIndex}].when.tokenType`, `duplicate tokenType tier: ${tokenType}`)
      continue
    }
    seenTokenTypes.add(tokenType)
  }

  for (const requiredTokenType of TEXT_TOKEN_TYPES) {
    if (!seenTokenTypes.has(requiredTokenType)) {
      pushIssue(issues, file, index, 'pricing.tiers', `missing text tier tokenType=${requiredTokenType}`)
    }
  }
}

function validateMediaCapabilityTierFields(issues, file, index, item, tiers, capabilityOptionFieldsMap) {
  const modelType = item.apiType
  const provider = item.provider
  const modelId = item.modelId
  const modelKey = buildModelKey(modelType, provider, modelId)
  const fallbackKey = buildModelKey(modelType, getProviderKey(provider), modelId)
  const optionFields = capabilityOptionFieldsMap.get(modelKey) || capabilityOptionFieldsMap.get(fallbackKey)

  if (!optionFields || optionFields.size === 0) {
    pushIssue(issues, file, index, 'pricing.tiers', `no capability option fields found for ${modelType} ${provider}/${modelId}`)
    return
  }

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
    const tier = tiers[tierIndex]
    if (!isRecord(tier) || !isRecord(tier.when)) continue
    for (const field of Object.keys(tier.when)) {
      if (!optionFields.has(field)) {
        pushIssue(
          issues,
          file,
          index,
          `pricing.tiers[${tierIndex}].when.${field}`,
          `field ${field} is not declared in capabilities options for ${modelType} ${provider}/${modelId}`,
        )
      }
    }
  }
}

function validateDuplicateCapabilityTiers(issues, file, index, tiers) {
  const seen = new Set()
  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
    const tier = tiers[tierIndex]
    if (!isRecord(tier) || !isRecord(tier.when)) continue
    const signature = JSON.stringify(Object.entries(tier.when).sort((left, right) => left[0].localeCompare(right[0])))
    if (seen.has(signature)) {
      pushIssue(issues, file, index, `pricing.tiers[${tierIndex}].when`, 'duplicate capability tier condition')
      continue
    }
    seen.add(signature)
  }
}

function validatePricing(issues, file, index, item, capabilityOptionFieldsMap) {
  const pricing = item.pricing
  if (!isRecord(pricing)) {
    pushIssue(issues, file, index, 'pricing', 'pricing must be object')
    return
  }

  if (!isNonEmptyString(pricing.mode) || !PRICING_MODES.has(pricing.mode)) {
    pushIssue(issues, file, index, 'pricing.mode', 'pricing.mode must be flat or capability')
    return
  }

  if (pricing.mode === 'flat') {
    if (!isFiniteNumber(pricing.flatAmount) || pricing.flatAmount < 0) {
      pushIssue(issues, file, index, 'pricing.flatAmount', 'flatAmount must be finite number >= 0')
    }
    return
  }

  if (!Array.isArray(pricing.tiers) || pricing.tiers.length === 0) {
    pushIssue(issues, file, index, 'pricing.tiers', 'tiers must be non-empty array')
    return
  }

  for (let tierIndex = 0; tierIndex < pricing.tiers.length; tierIndex += 1) {
    validateTier(issues, file, index, pricing.tiers[tierIndex], tierIndex)
  }

  validateDuplicateCapabilityTiers(issues, file, index, pricing.tiers)

  if (item.apiType === 'text') {
    validateTextCapabilityTiers(issues, file, index, pricing.tiers)
    return
  }

  if (item.apiType === 'image' || item.apiType === 'video') {
    validateMediaCapabilityTierFields(issues, file, index, item, pricing.tiers, capabilityOptionFieldsMap)
  }
}

async function main() {
  const issues = []
  const files = await listCatalogFiles()
  const capabilityCatalog = await readCapabilityCatalog()
  const capabilityOptionFieldsMap = buildCapabilityOptionFieldMap(capabilityCatalog)
  if (files.length === 0) {
    throw new Error(`no pricing files found in ${CATALOG_DIR}`)
  }

  for (const filePath of files) {
    const items = await readCatalog(filePath)
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!isRecord(item)) {
        pushIssue(issues, filePath, index, 'entry', 'entry must be object')
        continue
      }

      if (!isNonEmptyString(item.apiType) || !API_TYPES.has(item.apiType)) {
        pushIssue(issues, filePath, index, 'apiType', 'apiType must be one of text/image/video/voice/voice-design/lip-sync')
      }
      if (!isNonEmptyString(item.provider)) {
        pushIssue(issues, filePath, index, 'provider', 'provider must be non-empty string')
      }
      if (!isNonEmptyString(item.modelId)) {
        pushIssue(issues, filePath, index, 'modelId', 'modelId must be non-empty string')
      }

      validatePricing(issues, filePath, index, item, capabilityOptionFieldsMap)
    }
  }

  if (issues.length === 0) {
    process.stdout.write(`[check-pricing-catalog] OK (${files.length} files)\n`)
    return
  }

  const maxPrint = 50
  for (const issue of issues.slice(0, maxPrint)) {
    process.stdout.write(`[check-pricing-catalog] ${issue.file}#${issue.index} ${issue.field}: ${issue.message}\n`)
  }
  if (issues.length > maxPrint) {
    process.stdout.write(`[check-pricing-catalog] ... ${issues.length - maxPrint} more issues\n`)
  }
  process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`[check-pricing-catalog] failed: ${String(error)}\n`)
  process.exitCode = 1
})
