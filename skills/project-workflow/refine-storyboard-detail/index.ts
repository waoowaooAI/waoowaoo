import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { refineStoryboardDetailInputSchema, refineStoryboardDetailOutputSchema } from './schema'
import { refineStoryboardDetailResources } from './resources'
import { executeRefineStoryboardDetail, type RefineStoryboardDetailSkillInput } from './execute'
import { RefineStoryboardDetailSkillRender } from './render'

const skillMachine = getProjectSkillMachine('refine-storyboard-detail')

const refineStoryboardDetailSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: refineStoryboardDetailInputSchema,
    outputSchema: refineStoryboardDetailOutputSchema,
    inputArtifacts: [
      ARTIFACT_TYPES.STORYBOARD_PHASE1,
      ARTIFACT_TYPES.STORYBOARD_PHASE2_CINEMATOGRAPHY,
      ARTIFACT_TYPES.STORYBOARD_PHASE2_ACTING,
    ],
    outputArtifacts: [
      ARTIFACT_TYPES.STORYBOARD_PHASE3_DETAIL,
      ARTIFACT_TYPES.STORYBOARD_PANEL_SET,
    ],
  },
  resources: refineStoryboardDetailResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.STORYBOARD_PHASE3_DETAIL),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeRefineStoryboardDetail(input as RefineStoryboardDetailSkillInput),
  render: RefineStoryboardDetailSkillRender,
}

export default refineStoryboardDetailSkillPackage
