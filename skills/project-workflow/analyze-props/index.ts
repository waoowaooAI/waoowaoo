import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { analyzePropsInputSchema, analyzePropsOutputSchema } from './schema'
import { analyzePropsResources } from './resources'
import { executeAnalyzeProps, type AnalyzePropsSkillInput } from './execute'
import { AnalyzePropsSkillRender } from './render'

const skillMachine = getProjectSkillMachine('analyze-props')

const analyzePropsSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: analyzePropsInputSchema,
    outputSchema: analyzePropsOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.STORY_RAW],
    outputArtifacts: [ARTIFACT_TYPES.ANALYSIS_PROPS],
  },
  resources: analyzePropsResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.ANALYSIS_PROPS),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeAnalyzeProps(input as AnalyzePropsSkillInput),
  render: AnalyzePropsSkillRender,
}

export default analyzePropsSkillPackage
