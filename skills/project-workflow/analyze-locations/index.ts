import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { analyzeLocationsInputSchema, analyzeLocationsOutputSchema } from './schema'
import { analyzeLocationsResources } from './resources'
import { executeAnalyzeLocations, type AnalyzeLocationsSkillInput } from './execute'
import { AnalyzeLocationsSkillRender } from './render'

const skillMachine = getProjectSkillMachine('analyze-locations')

const analyzeLocationsSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: analyzeLocationsInputSchema,
    outputSchema: analyzeLocationsOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.STORY_RAW],
    outputArtifacts: [ARTIFACT_TYPES.ANALYSIS_LOCATIONS],
  },
  resources: analyzeLocationsResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.ANALYSIS_LOCATIONS),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeAnalyzeLocations(input as AnalyzeLocationsSkillInput),
  render: AnalyzeLocationsSkillRender,
}

export default analyzeLocationsSkillPackage
