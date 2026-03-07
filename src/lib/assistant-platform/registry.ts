import type { AssistantId, AssistantSkillDefinition } from './types'
import { apiConfigTemplateSkill } from './skills/api-config-template'
import { tutorialSkill } from './skills/tutorial'

const SKILLS: Record<AssistantId, AssistantSkillDefinition> = {
  'api-config-template': apiConfigTemplateSkill,
  tutorial: tutorialSkill,
}

export function getAssistantSkill(id: AssistantId): AssistantSkillDefinition {
  return SKILLS[id]
}

export function isAssistantId(value: unknown): value is AssistantId {
  return value === 'api-config-template' || value === 'tutorial'
}
