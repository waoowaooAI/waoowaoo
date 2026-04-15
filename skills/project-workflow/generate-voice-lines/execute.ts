import { executeVoiceLinesWithRetry } from '@skills/project-workflow/_shared/script-to-storyboard-runtime'

export type GenerateVoiceLinesSkillInput = Parameters<typeof executeVoiceLinesWithRetry>[0]

export async function executeGenerateVoiceLines(input: GenerateVoiceLinesSkillInput) {
  return await executeVoiceLinesWithRetry(input)
}
