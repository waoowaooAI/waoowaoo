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

