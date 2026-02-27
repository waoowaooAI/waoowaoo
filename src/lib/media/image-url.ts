const LOCAL_ORIGIN = 'http://localhost'
const NEXT_IMAGE_PATH = '/_next/image'
const COS_SIGN_PATH = '/api/cos/sign'
const MAX_NEXT_UNWRAP_DEPTH = 5
const STORAGE_KEY_PREFIXES = ['images/', 'video/', 'voice/'] as const

function isStorageKey(value: string): boolean {
  return STORAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value, LOCAL_ORIGIN)
  } catch {
    return null
  }
}

export function unwrapNextImageUrl(input: string): string {
  let current = input.trim()
  if (!current) return current

  for (let i = 0; i < MAX_NEXT_UNWRAP_DEPTH; i += 1) {
    const parsed = tryParseUrl(current)
    if (!parsed || parsed.pathname !== NEXT_IMAGE_PATH) {
      return current
    }

    const nestedUrl = parsed.searchParams.get('url')
    if (!nestedUrl) {
      return current
    }

    let decoded = nestedUrl
    try {
      decoded = decodeURIComponent(nestedUrl)
    } catch {
      decoded = nestedUrl
    }

    if (!decoded || decoded === current) {
      return current
    }

    current = decoded
  }

  return current
}

export function toDisplayImageUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  const unwrapped = unwrapNextImageUrl(raw)
  if (isStorageKey(unwrapped)) {
    return `${COS_SIGN_PATH}?key=${encodeURIComponent(unwrapped)}`
  }

  return unwrapped
}

export function resolveOriginalImageUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  const unwrapped = unwrapNextImageUrl(raw)
  if (isStorageKey(unwrapped)) {
    return `${COS_SIGN_PATH}?key=${encodeURIComponent(unwrapped)}`
  }

  const parsed = tryParseUrl(unwrapped)
  if (parsed?.pathname === COS_SIGN_PATH) {
    const key = parsed.searchParams.get('key')
    if (key) {
      let decodedKey = key
      try {
        decodedKey = decodeURIComponent(key)
      } catch {
        decodedKey = key
      }
      return `${COS_SIGN_PATH}?key=${encodeURIComponent(decodedKey)}`
    }
  }

  return unwrapped
}
