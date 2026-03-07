type ProviderEntryMigrationSummary = {
  providersScanned: number
  providersChanged: number
  routeLitellmToOpenaiCompat: number
  routeForcedOfficial: number
  geminiApiModeCorrected: number
}

export type GatewayRoutePayloadMigrationSummary = ProviderEntryMigrationSummary & {
  invalidPayload: boolean
}

type ProviderMigrationResult = {
  changed: boolean
  next: unknown
  summary: ProviderEntryMigrationSummary
}

type PayloadMigrationResult = {
  status: 'ok' | 'invalid'
  changed: boolean
  nextRaw: string | null | undefined
  summary: GatewayRoutePayloadMigrationSummary
}

function zeroProviderSummary(): ProviderEntryMigrationSummary {
  return {
    providersScanned: 0,
    providersChanged: 0,
    routeLitellmToOpenaiCompat: 0,
    routeForcedOfficial: 0,
    geminiApiModeCorrected: 0,
  }
}

function addProviderSummary(
  left: ProviderEntryMigrationSummary,
  right: ProviderEntryMigrationSummary,
): ProviderEntryMigrationSummary {
  return {
    providersScanned: left.providersScanned + right.providersScanned,
    providersChanged: left.providersChanged + right.providersChanged,
    routeLitellmToOpenaiCompat: left.routeLitellmToOpenaiCompat + right.routeLitellmToOpenaiCompat,
    routeForcedOfficial: left.routeForcedOfficial + right.routeForcedOfficial,
    geminiApiModeCorrected: left.geminiApiModeCorrected + right.geminiApiModeCorrected,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return index === -1 ? providerId : providerId.slice(0, index)
}

export function migrateProviderEntry(rawProvider: unknown): ProviderMigrationResult {
  const summary = zeroProviderSummary()
  if (!isRecord(rawProvider)) {
    return { changed: false, next: rawProvider, summary }
  }

  const providerId = readTrimmedString(rawProvider.id)
  if (!providerId) {
    return { changed: false, next: rawProvider, summary }
  }
  summary.providersScanned = 1

  const providerKey = getProviderKey(providerId)
  const nextProvider: Record<string, unknown> = { ...rawProvider }
  let changed = false

  const routeRaw = readTrimmedString(rawProvider.gatewayRoute)
  const apiModeRaw = readTrimmedString(rawProvider.apiMode)

  if (providerKey === 'openai-compatible') {
    if (routeRaw !== 'openai-compat') {
      nextProvider.gatewayRoute = 'openai-compat'
      changed = true
      if (routeRaw === 'litellm') {
        summary.routeLitellmToOpenaiCompat += 1
      }
    }
  } else if (providerKey === 'gemini-compatible') {
    if (apiModeRaw === 'openai-official') {
      nextProvider.apiMode = 'gemini-sdk'
      changed = true
      summary.geminiApiModeCorrected += 1
    }
    if (routeRaw !== 'official') {
      nextProvider.gatewayRoute = 'official'
      changed = true
      if (routeRaw === 'litellm' || routeRaw === 'openai-compat') {
        summary.routeForcedOfficial += 1
      }
    }
  } else {
    if (routeRaw === 'litellm' || routeRaw === 'openai-compat') {
      nextProvider.gatewayRoute = 'official'
      changed = true
      summary.routeForcedOfficial += 1
    }
  }

  if (changed) {
    summary.providersChanged = 1
  }
  return { changed, next: changed ? nextProvider : rawProvider, summary }
}

export function migrateGatewayRoutePayload(rawProviders: string | null | undefined): PayloadMigrationResult {
  const baseSummary: GatewayRoutePayloadMigrationSummary = {
    ...zeroProviderSummary(),
    invalidPayload: false,
  }
  if (!rawProviders) {
    return {
      status: 'ok',
      changed: false,
      nextRaw: rawProviders,
      summary: baseSummary,
    }
  }

  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawProviders) as unknown
  } catch {
    return {
      status: 'invalid',
      changed: false,
      nextRaw: rawProviders,
      summary: { ...baseSummary, invalidPayload: true },
    }
  }

  if (!Array.isArray(parsedUnknown)) {
    return {
      status: 'invalid',
      changed: false,
      nextRaw: rawProviders,
      summary: { ...baseSummary, invalidPayload: true },
    }
  }

  const nextProviders: unknown[] = []
  let summary = zeroProviderSummary()
  let changed = false
  for (const provider of parsedUnknown) {
    const result = migrateProviderEntry(provider)
    summary = addProviderSummary(summary, result.summary)
    changed = changed || result.changed
    nextProviders.push(result.next)
  }

  return {
    status: 'ok',
    changed,
    nextRaw: changed ? JSON.stringify(nextProviders) : rawProviders,
    summary: {
      ...summary,
      invalidPayload: false,
    },
  }
}
