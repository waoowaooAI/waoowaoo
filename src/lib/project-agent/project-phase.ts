import { TASK_TYPE } from '@/lib/task/types'
import { assembleProjectProjectionLite } from '@/lib/project-projection/lite'

export const PROJECT_PHASE = {
  DRAFT: 'draft',
  SCRIPT_ANALYZING: 'script_analyzing',
  SCRIPT_READY: 'script_ready',
  STORYBOARD_GENERATING: 'storyboard_generating',
  STORYBOARD_READY: 'storyboard_ready',
  VOICE_READY: 'voice_ready',
} as const

export type ProjectPhase = (typeof PROJECT_PHASE)[keyof typeof PROJECT_PHASE]

export interface ProjectPhaseSnapshot {
  phase: ProjectPhase
  progress: {
    clipCount: number
    screenplayClipCount: number
    storyboardCount: number
    panelCount: number
    voiceLineCount: number
  }
  activeRunCount: number
  failedItems: string[]
  availableActions: {
    actMode: string[]
    planMode: string[]
  }
}

function resolveAvailableActions(phase: ProjectPhase, hasEpisode: boolean): ProjectPhaseSnapshot['availableActions'] {
  if (!hasEpisode) {
    return {
      actMode: [],
      planMode: [],
    }
  }

  switch (phase) {
    case PROJECT_PHASE.DRAFT:
      return {
        actMode: [],
        planMode: ['story-to-script'],
      }
    case PROJECT_PHASE.SCRIPT_READY:
      return {
        actMode: [],
        planMode: ['script-to-storyboard'],
      }
    case PROJECT_PHASE.STORYBOARD_READY:
      return {
        actMode: ['generate_character_image', 'generate_location_image', 'regenerate_panel_image', 'voice_generate'],
        planMode: [],
      }
    case PROJECT_PHASE.VOICE_READY:
      return {
        actMode: ['generate_video'],
        planMode: [],
      }
    default:
      return {
        actMode: [],
        planMode: [],
      }
  }
}

export async function resolveProjectPhase(params: {
  projectId: string
  userId: string
  episodeId?: string | null
  currentStage?: string | null
}): Promise<ProjectPhaseSnapshot> {
  const projection = await assembleProjectProjectionLite({
    projectId: params.projectId,
    userId: params.userId,
    episodeId: params.episodeId || null,
    currentStage: params.currentStage || null,
  })

  const progress = projection.progress

  const activeWorkflowTypes = new Set(projection.activeRuns.map((run) => run.workflowType))
  let phase: ProjectPhase = PROJECT_PHASE.DRAFT

  if (activeWorkflowTypes.has(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)) {
    phase = PROJECT_PHASE.STORYBOARD_GENERATING
  } else if (activeWorkflowTypes.has(TASK_TYPE.STORY_TO_SCRIPT_RUN)) {
    phase = PROJECT_PHASE.SCRIPT_ANALYZING
  } else if (progress.voiceLineCount > 0) {
    phase = PROJECT_PHASE.VOICE_READY
  } else if (progress.storyboardCount > 0 || progress.panelCount > 0) {
    phase = PROJECT_PHASE.STORYBOARD_READY
  } else if (progress.screenplayClipCount > 0) {
    phase = PROJECT_PHASE.SCRIPT_READY
  }

  return {
    phase,
    progress,
    activeRunCount: projection.activeRuns.length,
    failedItems: [],
    availableActions: resolveAvailableActions(phase, !!projection.episodeId),
  }
}
