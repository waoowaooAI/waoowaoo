import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { refineCinematographyInputSchema, refineCinematographyOutputSchema } from './schema'
import { refineCinematographyResources } from './resources'
import { executeRefineCinematography, type RefineCinematographySkillInput } from './execute'
import { RefineCinematographySkillRender } from './render'

const skillMachine = getProjectSkillMachine('refine-cinematography')

const refineCinematographySkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: refineCinematographyInputSchema,
    outputSchema: refineCinematographyOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PHASE1],
    outputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PHASE2_CINEMATOGRAPHY],
  },
  resources: refineCinematographyResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.STORYBOARD_PHASE2_CINEMATOGRAPHY),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeRefineCinematography(input as RefineCinematographySkillInput),
  render: RefineCinematographySkillRender,
}

export default refineCinematographySkillPackage
