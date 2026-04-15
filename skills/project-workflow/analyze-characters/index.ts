import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { analyzeCharactersInputSchema, analyzeCharactersOutputSchema } from './schema'
import { analyzeCharactersResources } from './resources'
import { executeAnalyzeCharacters, type AnalyzeCharactersSkillInput } from './execute'
import { AnalyzeCharactersSkillRender } from './render'

const skillMachine = getProjectSkillMachine('analyze-characters')

const analyzeCharactersSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: analyzeCharactersInputSchema,
    outputSchema: analyzeCharactersOutputSchema,
    inputArtifacts: [ARTIFACT_TYPES.STORY_RAW],
    outputArtifacts: [ARTIFACT_TYPES.ANALYSIS_CHARACTERS],
  },
  resources: analyzeCharactersResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.ANALYSIS_CHARACTERS),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeAnalyzeCharacters(input as AnalyzeCharactersSkillInput),
  render: AnalyzeCharactersSkillRender,
}

export default analyzeCharactersSkillPackage
