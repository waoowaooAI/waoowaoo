export class ImageUrlsContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageUrlsContractError'
  }
}

function assertStringArray(value: unknown, fieldName: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new ImageUrlsContractError(`${fieldName} must be a JSON array`)
  }
  const invalidIndex = value.findIndex((item) => typeof item !== 'string')
  if (invalidIndex !== -1) {
    throw new ImageUrlsContractError(`${fieldName}[${invalidIndex}] must be a string`)
  }
}

export function decodeImageUrlsStrict(raw: string, fieldName = 'imageUrls'): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ImageUrlsContractError(`${fieldName} must be valid JSON`)
  }

  assertStringArray(parsed, fieldName)
  return parsed
}

export function decodeImageUrlsFromDb(raw: string | null | undefined, fieldName = 'imageUrls'): string[] {
  if (typeof raw !== 'string') {
    throw new ImageUrlsContractError(`${fieldName} must be a JSON string in DB`)
  }
  return decodeImageUrlsStrict(raw, fieldName)
}

export function encodeImageUrls(value: string[], fieldName = 'imageUrls'): string {
  assertStringArray(value, fieldName)
  return JSON.stringify(value)
}
