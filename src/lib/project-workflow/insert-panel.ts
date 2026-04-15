const DEFAULT_INSERT_PANEL_USER_INPUT = {
  zh: '请根据前后镜头自动分析并插入一个自然衔接的新分镜。',
  en: 'Automatically analyze the surrounding panels and insert a naturally connected new panel.',
} as const

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isZhLocale(locale: string | undefined): boolean {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh')
}

export function resolveInsertPanelUserInput(payload: Record<string, unknown>, locale?: string): string {
  const explicitInput = readTrimmedString(payload.userInput)
  if (explicitInput) return explicitInput

  const promptInput = readTrimmedString(payload.prompt)
  if (promptInput) return promptInput

  return isZhLocale(locale)
    ? DEFAULT_INSERT_PANEL_USER_INPUT.zh
    : DEFAULT_INSERT_PANEL_USER_INPUT.en
}
