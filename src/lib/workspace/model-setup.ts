interface PreferenceRecord {
  analysisModel?: string | null
}

interface UserPreferencePayload {
  preference?: PreferenceRecord | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function hasConfiguredAnalysisModel(payload: unknown): boolean {
  return readConfiguredAnalysisModel(payload) !== null
}

export function readConfiguredAnalysisModel(payload: unknown): string | null {
  if (!isObjectLike(payload)) return null

  const preferenceValue = payload.preference
  if (!isObjectLike(preferenceValue)) return null

  const preference = preferenceValue as PreferenceRecord
  return isNonEmptyString(preference.analysisModel) ? preference.analysisModel.trim() : null
}

export function shouldGuideToModelSetup(payload: unknown): boolean {
  return !hasConfiguredAnalysisModel(payload)
}

export type { UserPreferencePayload }
