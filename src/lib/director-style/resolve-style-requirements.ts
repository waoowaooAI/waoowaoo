import { AI_PROMPT_IDS, type AiPromptId } from '@/lib/ai-prompts'
import type { DirectorStyleDoc, DirectorStyleDocField, DirectorStyleGuidanceBlock } from './types'

const PROMPT_TO_STYLE_FIELDS: Partial<Record<AiPromptId, readonly DirectorStyleDocField[]>> = {
  [AI_PROMPT_IDS.CHARACTER_ANALYZE]: ['character'],
  [AI_PROMPT_IDS.LOCATION_ANALYZE]: ['location'],
  [AI_PROMPT_IDS.PROP_ANALYZE]: ['prop'],
  [AI_PROMPT_IDS.STORYBOARD_PLAN]: ['storyboardPlan'],
  [AI_PROMPT_IDS.STORYBOARD_REFINE_CINEMATOGRAPHY]: ['cinematography'],
  [AI_PROMPT_IDS.STORYBOARD_REFINE_ACTING]: ['acting'],
  [AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL]: ['storyboardDetail', 'video'],
  [AI_PROMPT_IDS.PANEL_IMAGE_GENERATE]: ['image'],
  [AI_PROMPT_IDS.SHOT_VARIANT_ANALYZE]: ['storyboardDetail', 'video'],
  [AI_PROMPT_IDS.SHOT_VARIANT_GENERATE]: ['image'],
  [AI_PROMPT_IDS.STORYBOARD_INSERT_PANEL]: ['storyboardDetail', 'video'],
} as const

function pickStyleBlocks(
  directorStyleDoc: DirectorStyleDoc,
  fields: readonly DirectorStyleDocField[],
): DirectorStyleGuidanceBlock | Partial<Record<DirectorStyleDocField, DirectorStyleGuidanceBlock>> {
  if (fields.length === 1) {
    const field = fields[0]
    if (!field) return {}
    return directorStyleDoc[field]
  }

  const selected: Partial<Record<DirectorStyleDocField, DirectorStyleGuidanceBlock>> = {}
  for (const field of fields) {
    selected[field] = directorStyleDoc[field]
  }
  return selected
}

export function resolveDirectorStyleRequirements(
  promptId: AiPromptId,
  directorStyleDoc: DirectorStyleDoc | null | undefined,
): string {
  if (!directorStyleDoc) return ''
  const fields = PROMPT_TO_STYLE_FIELDS[promptId]
  if (!fields || fields.length === 0) return ''
  return JSON.stringify(pickStyleBlocks(directorStyleDoc, fields), null, 2)
}
