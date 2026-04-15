import { resolveInvalidatedArtifacts } from '@/lib/artifact-system/dependencies'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'
import type { SkillPackage } from '@/lib/skill-system/types'
import { splitClipsInputSchema, splitClipsOutputSchema } from './schema'
import { splitClipsResources } from './resources'
import { executeSplitClips, type SplitClipsSkillInput } from './execute'
import { SplitClipsSkillRender } from './render'

const skillMachine = getProjectSkillMachine('split-clips')

const splitClipsSkillPackage: SkillPackage = {
  kind: 'skill',
  metadata: skillMachine.metadata,
  instructions: skillMachine.instructions,
  interface: {
    inputSchema: splitClipsInputSchema,
    outputSchema: splitClipsOutputSchema,
    inputArtifacts: [
      ARTIFACT_TYPES.STORY_RAW,
      ARTIFACT_TYPES.ANALYSIS_CHARACTERS,
      ARTIFACT_TYPES.ANALYSIS_LOCATIONS,
      ARTIFACT_TYPES.ANALYSIS_PROPS,
    ],
    outputArtifacts: [ARTIFACT_TYPES.CLIP_SPLIT],
  },
  resources: splitClipsResources,
  effects: {
    mutationKind: 'generate',
    invalidates: resolveInvalidatedArtifacts(ARTIFACT_TYPES.CLIP_SPLIT),
    requiresApproval: false,
  },
  legacyStepIds: skillMachine.legacyStepIds,
  execute: async (input) => await executeSplitClips(input as SplitClipsSkillInput),
  render: SplitClipsSkillRender,
}

export default splitClipsSkillPackage
