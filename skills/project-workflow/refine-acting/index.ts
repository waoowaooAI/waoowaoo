import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { refineActingInputSchema, refineActingOutputSchema } from './schema'
import { refineActingResources } from './resources'
import { executeRefineActing, type RefineActingSkillInput } from './execute'
import { RefineActingSkillRender } from './render'

const skillMachine = getProjectSkillMachine('refine-acting')

const refineActingSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: refineActingInputSchema,
    outputSchema: refineActingOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PHASE1],
    outputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PHASE2_ACTING],
  },
  resources: refineActingResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.STORYBOARD_PHASE2_ACTING),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeRefineActing(input as RefineActingSkillInput),
  render: RefineActingSkillRender,
}

export default refineActingSkillPackage
