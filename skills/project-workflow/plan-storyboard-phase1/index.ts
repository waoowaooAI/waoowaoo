import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { planStoryboardPhase1InputSchema, planStoryboardPhase1OutputSchema } from './schema'
import { planStoryboardPhase1Resources } from './resources'
import { executePlanStoryboardPhase1, type PlanStoryboardPhase1SkillInput } from './execute'
import { PlanStoryboardPhase1SkillRender } from './render'

const skillMachine = getProjectSkillMachine('plan-storyboard-phase1')

const planStoryboardPhase1SkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: planStoryboardPhase1InputSchema,
    outputSchema: planStoryboardPhase1OutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.CLIP_SCREENPLAY],
    outputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PHASE1],
  },
  resources: planStoryboardPhase1Resources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.STORYBOARD_PHASE1),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executePlanStoryboardPhase1(input as PlanStoryboardPhase1SkillInput),
  render: PlanStoryboardPhase1SkillRender,
}

export default planStoryboardPhase1SkillPackage
