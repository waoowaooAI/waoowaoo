import { buildCharactersLibInfo, type CharacterBrief } from './analyze-global-parse'
import type { Locale } from '@/i18n/routing'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'

export type AnalyzeGlobalPromptTemplates = {
  characterPromptTemplate: string
  locationPromptTemplate: string
}

export function loadAnalyzeGlobalPromptTemplates(locale: Locale): AnalyzeGlobalPromptTemplates {
  return {
    characterPromptTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE, locale),
    locationPromptTemplate: getPromptTemplate(PROMPT_IDS.NP_SELECT_LOCATION, locale),
  }
}

export function buildAnalyzeGlobalPrompts(params: {
  chunk: string
  templates: AnalyzeGlobalPromptTemplates
  existingCharacters: CharacterBrief[]
  existingLocationInfo: string[]
}) {
  const characterPrompt = params.templates.characterPromptTemplate
    .replace('{input}', params.chunk)
    .replace('{characters_lib_info}', buildCharactersLibInfo(params.existingCharacters))
  const locationPrompt = params.templates.locationPromptTemplate
    .replace('{input}', params.chunk)
    .replace('{locations_lib_name}', params.existingLocationInfo.join(', ') || '无')
  return {
    characterPrompt,
    locationPrompt,
  }
}
