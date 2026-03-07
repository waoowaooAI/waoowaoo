import type {
  CapabilityFieldI18n,
  CapabilityValue,
  VideoCapabilities,
} from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'

export interface EffectiveVideoCapabilityDefinition {
  field: string
  options: CapabilityValue[]
  fieldI18n: CapabilityFieldI18n | null
}

export interface EffectiveVideoCapabilityField extends EffectiveVideoCapabilityDefinition {
  value: CapabilityValue | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isCapabilityValueArray(value: unknown): value is CapabilityValue[] {
  return Array.isArray(value) && value.every((item) => isCapabilityValue(item))
}

function parseFieldI18n(raw: unknown): CapabilityFieldI18n | null {
  if (!isRecord(raw)) return null
  const labelKey = typeof raw.labelKey === 'string' && raw.labelKey.trim() ? raw.labelKey.trim() : undefined
  const unitKey = typeof raw.unitKey === 'string' && raw.unitKey.trim() ? raw.unitKey.trim() : undefined
  const optionLabelKeys = isRecord(raw.optionLabelKeys)
    ? Object.entries(raw.optionLabelKeys).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        acc[key] = value.trim()
      }
      return acc
    }, {})
    : undefined
  return {
    ...(labelKey ? { labelKey } : {}),
    ...(unitKey ? { unitKey } : {}),
    ...(optionLabelKeys && Object.keys(optionLabelKeys).length > 0 ? { optionLabelKeys } : {}),
  }
}

function pushUnique(target: CapabilityValue[], value: CapabilityValue) {
  if (!target.includes(value)) {
    target.push(value)
  }
}

function collectFieldI18nMap(
  videoCapabilities: VideoCapabilities | undefined,
): Record<string, CapabilityFieldI18n | null> {
  const map: Record<string, CapabilityFieldI18n | null> = {}
  const rawMap = isRecord(videoCapabilities?.fieldI18n) ? videoCapabilities.fieldI18n : {}
  for (const [field, raw] of Object.entries(rawMap)) {
    map[field] = parseFieldI18n(raw)
  }
  return map
}

function buildDefinitionsFromPricingTiers(
  tiers: VideoPricingTier[],
  fieldI18nMap: Record<string, CapabilityFieldI18n | null>,
): EffectiveVideoCapabilityDefinition[] {
  const fieldOrder: string[] = []
  const fieldValues = new Map<string, CapabilityValue[]>()

  for (const tier of tiers) {
    for (const [field, rawValue] of Object.entries(tier.when)) {
      if (!isCapabilityValue(rawValue)) continue
      if (!fieldValues.has(field)) {
        fieldValues.set(field, [])
        fieldOrder.push(field)
      }
      const values = fieldValues.get(field)
      if (!values) continue
      pushUnique(values, rawValue)
    }
  }

  const definitions: EffectiveVideoCapabilityDefinition[] = []
  for (const field of fieldOrder) {
    const options = fieldValues.get(field) || []
    if (options.length === 0) continue
    definitions.push({
      field,
      options,
      fieldI18n: fieldI18nMap[field] || null,
    })
  }
  return definitions
}

function buildDefinitionsFromCapabilities(
  videoCapabilities: VideoCapabilities | undefined,
  fieldI18nMap: Record<string, CapabilityFieldI18n | null>,
): EffectiveVideoCapabilityDefinition[] {
  if (!isRecord(videoCapabilities)) return []
  const definitions: EffectiveVideoCapabilityDefinition[] = []

  for (const [key, rawValue] of Object.entries(videoCapabilities)) {
    if (!key.endsWith('Options')) continue
    if (!isCapabilityValueArray(rawValue) || rawValue.length === 0) continue
    const field = key.slice(0, -'Options'.length)
    definitions.push({
      field,
      options: rawValue,
      fieldI18n: fieldI18nMap[field] || null,
    })
  }

  return definitions
}

function hasTierMatch(
  tiers: VideoPricingTier[],
  selection: Record<string, CapabilityValue>,
): boolean {
  if (tiers.length === 0) return true
  return tiers.some((tier) =>
    Object.entries(selection).every(([field, value]) => {
      const tierValue = tier.when[field]
      if (tierValue === undefined) return true
      return tierValue === value
    }))
}

function getCompatibleOptionsForField(input: {
  field: string
  options: CapabilityValue[]
  tiers: VideoPricingTier[]
  selection: Record<string, CapabilityValue>
}): CapabilityValue[] {
  const { field, options, tiers, selection } = input
  if (tiers.length === 0) return options.slice()
  return options.filter((candidate) =>
    hasTierMatch(tiers, {
      ...selection,
      [field]: candidate,
    }))
}

function filterSelectionByDefinitions(
  definitions: EffectiveVideoCapabilityDefinition[],
  selection: Record<string, CapabilityValue> | undefined,
): Record<string, CapabilityValue> {
  if (!selection) return {}
  const fields = new Set(definitions.map((definition) => definition.field))
  const next: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(selection)) {
    if (!fields.has(field)) continue
    if (!isCapabilityValue(value)) continue
    next[field] = value
  }
  return next
}

export function resolveEffectiveVideoCapabilityDefinitions(input: {
  videoCapabilities?: VideoCapabilities
  pricingTiers?: VideoPricingTier[]
}): EffectiveVideoCapabilityDefinition[] {
  const tiers = input.pricingTiers || []
  const fieldI18nMap = collectFieldI18nMap(input.videoCapabilities)
  const capabilityDefinitions = buildDefinitionsFromCapabilities(input.videoCapabilities, fieldI18nMap)

  // Capabilities 是参数字段唯一来源；pricing 只用于约束可选项范围。
  if (capabilityDefinitions.length > 0) {
    return capabilityDefinitions
  }

  if (tiers.length > 0) {
    return buildDefinitionsFromPricingTiers(tiers, fieldI18nMap)
  }

  return []
}

export function normalizeVideoGenerationSelections(input: {
  definitions: EffectiveVideoCapabilityDefinition[]
  pricingTiers?: VideoPricingTier[]
  selection?: Record<string, CapabilityValue>
  pinnedFields?: string[]
}): Record<string, CapabilityValue> {
  const tiers = input.pricingTiers || []
  const normalized = filterSelectionByDefinitions(input.definitions, input.selection)
  const pinnedFieldSet = new Set(input.pinnedFields || [])
  const orderedDefinitions = input.definitions.slice().sort((left, right) => {
    const leftPinned = pinnedFieldSet.has(left.field)
    const rightPinned = pinnedFieldSet.has(right.field)
    if (leftPinned === rightPinned) return 0
    return leftPinned ? 1 : -1
  })

  if (input.definitions.length === 0) return {}

  let changed = true
  let attempts = 0
  const maxAttempts = Math.max(4, input.definitions.length * 3)
  while (changed && attempts < maxAttempts) {
    attempts += 1
    changed = false

    for (const definition of orderedDefinitions) {
      const compatibleOptions = getCompatibleOptionsForField({
        field: definition.field,
        options: definition.options,
        tiers,
        selection: normalized,
      })

      const current = normalized[definition.field]
      if (compatibleOptions.length === 0) {
        if (current !== undefined) {
          delete normalized[definition.field]
          changed = true
        }
        continue
      }

      if (current === undefined || !compatibleOptions.includes(current)) {
        normalized[definition.field] = compatibleOptions[0]
        changed = true
      }
    }
  }

  return normalized
}

export function resolveEffectiveVideoCapabilityFields(input: {
  definitions: EffectiveVideoCapabilityDefinition[]
  pricingTiers?: VideoPricingTier[]
  selection?: Record<string, CapabilityValue>
}): EffectiveVideoCapabilityField[] {
  const tiers = input.pricingTiers || []
  const normalized = normalizeVideoGenerationSelections({
    definitions: input.definitions,
    pricingTiers: tiers,
    selection: input.selection,
  })

  return input.definitions.map((definition) => {
    const options = getCompatibleOptionsForField({
      field: definition.field,
      options: definition.options,
      tiers,
      selection: normalized,
    })
    const value = normalized[definition.field]
    return {
      ...definition,
      options,
      value: value !== undefined && options.includes(value) ? value : undefined,
    }
  })
}
