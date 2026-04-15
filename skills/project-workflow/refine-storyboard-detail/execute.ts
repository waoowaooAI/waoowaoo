import { executeRefineStoryboardDetailSkill } from '@skills/project-workflow/_shared/script-to-storyboard-skills'

export type RefineStoryboardDetailSkillInput = Parameters<typeof executeRefineStoryboardDetailSkill>[0]

export async function executeRefineStoryboardDetail(input: RefineStoryboardDetailSkillInput) {
  return await executeRefineStoryboardDetailSkill(input)
}
