import type { Locale } from '@/i18n/routing'
import type { PromptId } from './prompt-ids'

export type PromptLocale = Locale

export type PromptVariables = Record<string, string>

export type PromptCatalogEntry = {
  pathStem: string
  variableKeys: readonly string[]
}

export type BuildPromptInput = {
  promptId: PromptId
  locale: PromptLocale
  variables?: PromptVariables
}
