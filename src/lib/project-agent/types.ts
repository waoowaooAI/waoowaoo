import type { UIMessage } from 'ai'
import type { CommandExecutionResult } from '@/lib/command-center/types'
import type { WorkflowCanonicalEvent } from '@/lib/agent/events/workflow-events'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'
import type { ProjectPhase, ProjectPhaseSnapshot } from './project-phase'
import type { WorkflowPackageId, WorkflowSkillId } from '@/lib/skill-system/types'

export type ProjectAssistantId = 'workspace-command'

export interface ProjectAgentContext {
  locale?: string
  episodeId?: string | null
  currentStage?: string | null
}

export interface WorkflowPlanPartData {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
  summary: string
  requiresApproval: boolean
  event?: WorkflowCanonicalEvent | null
  steps: Array<{
    skillId: string
    title: string
  }>
}

export interface ApprovalRequestPartData {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
  summary: string
  reasons: string[]
  event?: WorkflowCanonicalEvent | null
}

export interface WorkflowStatusPartData {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
  runId?: string | null
  status: CommandExecutionResult['status']
  activeSkillId?: WorkflowSkillId | null
  event?: WorkflowCanonicalEvent | null
}

export interface ScriptPreviewPartData {
  workflowId: 'story-to-script'
  episodeId: string
  clips: Array<{
    clipId: string
    summary: string
    sceneCount: number
  }>
}

export interface StoryboardPreviewPartData {
  workflowId: 'script-to-storyboard'
  episodeId: string
  storyboards: Array<{
    storyboardId: string
    clipId: string
    clipSummary: string
    panelCount: number
    sampleDescriptions: string[]
  }>
  voiceLineCount: number
}

export interface ProjectContextPartData {
  context: ProjectAssistantContextSnapshot
}

export interface ProjectPhasePartData {
  phase: ProjectPhase
  snapshot: ProjectPhaseSnapshot
}

export interface ConfirmationRequestPartData {
  operationId: string
  summary: string
  argsHint?: Record<string, unknown> | null
}

export interface ProjectAssistantContextSnapshot {
  projectId: string
  projectName: string
  episodeId?: string | null
  episodeName?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  activeRuns: ProjectContextSnapshot['activeRuns']
  latestArtifacts: ProjectContextSnapshot['latestArtifacts']
  config: {
    analysisModel?: string | null
    artStyle: string
    videoRatio: string
  }
  workflow?: ProjectContextSnapshot['workflow']
}

export interface ProjectAssistantThreadSnapshot {
  id: string
  assistantId: ProjectAssistantId
  projectId: string
  episodeId?: string | null
  scopeRef: string
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

export type WorkspaceAssistantPartType =
  | 'data-project-phase'
  | 'data-confirmation-request'
  | 'data-workflow-plan'
  | 'data-approval-request'
  | 'data-workflow-status'
  | 'data-script-preview'
  | 'data-storyboard-preview'
  | 'data-project-context'
