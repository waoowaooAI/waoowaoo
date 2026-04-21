import { AI_PROMPT_IDS, type AiPromptId } from '@/lib/ai-prompts'
import type { DirectorStyleDoc, DirectorStyleDocField } from './types'

const PROMPT_TO_STYLE_FIELD: Partial<Record<AiPromptId, DirectorStyleDocField>> = {
  [AI_PROMPT_IDS.CHARACTER_ANALYZE]: 'character',
  [AI_PROMPT_IDS.LOCATION_ANALYZE]: 'location',
  [AI_PROMPT_IDS.PROP_ANALYZE]: 'prop',
  [AI_PROMPT_IDS.STORYBOARD_PLAN]: 'storyboardPlan',
  [AI_PROMPT_IDS.STORYBOARD_REFINE_CINEMATOGRAPHY]: 'cinematography',
  [AI_PROMPT_IDS.STORYBOARD_REFINE_ACTING]: 'acting',
  [AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL]: 'storyboardDetail',
  [AI_PROMPT_IDS.PANEL_IMAGE_GENERATE]: 'image',
  [AI_PROMPT_IDS.SHOT_VARIANT_ANALYZE]: 'storyboardDetail',
  [AI_PROMPT_IDS.SHOT_VARIANT_GENERATE]: 'image',
  [AI_PROMPT_IDS.STORYBOARD_INSERT_PANEL]: 'storyboardDetail',
} as const

export function resolveDirectorStyleRequirements(
  promptId: AiPromptId,
  directorStyleDoc: DirectorStyleDoc | null | undefined,
): string {
  if (!directorStyleDoc) return ''
  const field = PROMPT_TO_STYLE_FIELD[promptId]
  if (!field) return ''
  return JSON.stringify(directorStyleDoc[field], null, 2)
}
