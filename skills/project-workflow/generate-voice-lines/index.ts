import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { generateVoiceLinesInputSchema, generateVoiceLinesOutputSchema } from './schema'
import { generateVoiceLinesResources } from './resources'
import { executeGenerateVoiceLines, type GenerateVoiceLinesSkillInput } from './execute'
import { GenerateVoiceLinesSkillRender } from './render'

const skillMachine = getProjectSkillMachine('generate-voice-lines')

const generateVoiceLinesSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: generateVoiceLinesInputSchema,
    outputSchema: generateVoiceLinesOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PANEL_SET],
    outputArtifacts: [ARTIFACT_TYPES.VOICE_LINES],
  },
  resources: generateVoiceLinesResources,
  effects: {
    mutationKind: 'generate',
    invalidates: [],
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeGenerateVoiceLines(input as GenerateVoiceLinesSkillInput),
  render: GenerateVoiceLinesSkillRender,
}

export default generateVoiceLinesSkillPackage
