import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { generateScreenplayInputSchema, generateScreenplayOutputSchema } from './schema'
import { generateScreenplayResources } from './resources'
import { executeGenerateScreenplay, type GenerateScreenplaySkillInput } from './execute'
import { GenerateScreenplaySkillRender } from './render'

const skillMachine = getProjectSkillMachine('generate-screenplay')

const generateScreenplaySkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: generateScreenplayInputSchema,
    outputSchema: generateScreenplayOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.CLIP_SPLIT],
    outputArtifacts: [ARTIFACT_TYPES.CLIP_SCREENPLAY],
  },
  resources: generateScreenplayResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.CLIP_SCREENPLAY),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeGenerateScreenplay(input as GenerateScreenplaySkillInput),
  render: GenerateScreenplaySkillRender,
}

export default generateScreenplaySkillPackage
