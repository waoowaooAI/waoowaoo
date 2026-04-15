import { executeAnalyzeCharactersSkill } from '@skills/project-workflow/_shared/story-to-script-skills'

export type AnalyzeCharactersSkillInput = Parameters<typeof executeAnalyzeCharactersSkill>[0]

export async function executeAnalyzeCharacters(input: AnalyzeCharactersSkillInput) {
  return await executeAnalyzeCharactersSkill(input)
}
