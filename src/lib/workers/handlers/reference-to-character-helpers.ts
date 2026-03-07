const MAX_REFERENCE_IMAGES = 5

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readBoolean(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function parseReferenceImages(payload: Record<string, unknown>): string[] {
  const multi = Array.isArray(payload.referenceImageUrls)
    ? payload.referenceImageUrls.map((item) => readString(item)).filter(Boolean)
    : []
  if (multi.length > 0) {
    return multi.slice(0, MAX_REFERENCE_IMAGES)
  }
  const single = readString(payload.referenceImageUrl)
  if (single) return [single]
  return []
}
