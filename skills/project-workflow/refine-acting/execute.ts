import { executeRefineActingSkill } from '@skills/project-workflow/_shared/script-to-storyboard-skills'

export type RefineActingSkillInput = Parameters<typeof executeRefineActingSkill>[0]

export async function executeRefineActing(input: RefineActingSkillInput) {
  return await executeRefineActingSkill(input)
}
