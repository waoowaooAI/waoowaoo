import type {
  ProjectContextApprovalSummary,
  ProjectContextArtifactSummary,
  ProjectContextRunSummary,
  ProjectPolicySnapshot,
} from '@/lib/project-context/types'

export interface ProjectProjectionProgress {
  clipCount: number
  screenplayClipCount: number
  storyboardCount: number
  panelCount: number
  voiceLineCount: number
}

export interface ProjectProjectionLite {
  projectId: string
  projectName: string
  episodeId?: string | null
  episodeName?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  policy: ProjectPolicySnapshot
  progress: ProjectProjectionProgress
  activeRuns: ProjectContextRunSummary[]
  latestArtifacts: ProjectContextArtifactSummary[]
  approvals: ProjectContextApprovalSummary[]
}

export interface ProjectProjectionPanelSnapshot {
  panelId: string
  clipId: string
  storyboardId: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: string | null
  props: string | null
  duration: number | null
  imagePrompt: string | null
  imageUrl: string | null
  imageMediaId: string | null
  candidateImages: string | null
  videoPrompt: string | null
  videoUrl: string | null
  videoMediaId: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectProjectionFull extends ProjectProjectionLite {
  workflow: null | {
    clips: Array<{
      clipId: string
      summary: string
      storyboardId: string | null
      panelCount: number
    }>
    panels: ProjectProjectionPanelSnapshot[]
    panelLimit: number
    totalPanelCount: number
    truncated: boolean
  }
}
