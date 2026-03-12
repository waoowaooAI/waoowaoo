type MangaLocale = 'en' | 'vi' | 'ko' | 'zh'

type VocabularyViolation = {
  path: string
  value: string
  matchedTerm: string
}

const BANNED_TERMS_BY_LOCALE: Record<MangaLocale, RegExp[]> = {
  en: [/\bvideo\b/i, /\bclip\b/i],
  vi: [/\bvideo\b/i, /\bclip\b/i],
  ko: [/비디오/, /클립/],
  zh: [/视频/, /剪辑/],
}

function walkStrings(node: unknown, path: string[] = []): Array<{ path: string; value: string }> {
  if (typeof node === 'string') {
    return [{ path: path.join('.'), value: node }]
  }

  if (Array.isArray(node)) {
    return node.flatMap((item, index) => walkStrings(item, [...path, String(index)]))
  }

  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => walkStrings(value, [...path, key]))
  }

  return []
}

export function findMangaVocabularyViolations(locale: MangaLocale, scope: unknown): VocabularyViolation[] {
  const bannedTerms = BANNED_TERMS_BY_LOCALE[locale]
  const rows = walkStrings(scope)
  const violations: VocabularyViolation[] = []

  for (const row of rows) {
    for (const pattern of bannedTerms) {
      const matched = row.value.match(pattern)
      if (matched?.[0]) {
        violations.push({
          path: row.path,
          value: row.value,
          matchedTerm: matched[0],
        })
      }
    }
  }

  return violations
}
