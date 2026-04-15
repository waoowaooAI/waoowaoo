import { runSplitClipBoundaryMatch } from '@skills/project-workflow/_shared/story-to-script-runtime'

export type SplitClipsSkillInput = Parameters<typeof runSplitClipBoundaryMatch>[0]

export async function executeSplitClips(input: SplitClipsSkillInput) {
  return await runSplitClipBoundaryMatch(input)
}
