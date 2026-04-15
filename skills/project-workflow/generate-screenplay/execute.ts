import { executeGenerateScreenplaySkill } from '@skills/project-workflow/_shared/story-to-script-skills'

export type GenerateScreenplaySkillInput = Parameters<typeof executeGenerateScreenplaySkill>[0]

export async function executeGenerateScreenplay(input: GenerateScreenplaySkillInput) {
  return await executeGenerateScreenplaySkill(input)
}
