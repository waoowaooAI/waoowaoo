'use client'

import {
  buildRunLifecycleCanonicalEvent,
  type WorkflowCanonicalEvent,
} from '@/lib/agent/events/workflow-events'

export type WorkspaceAssistantWorkflowId = 'story-to-script' | 'script-to-storyboard'

export type WorkspaceAssistantWorkflowEventDetail = {
  status: 'started' | 'completed' | 'failed'
  workflowId: WorkspaceAssistantWorkflowId
  runId?: string
  errorMessage?: string
  canonicalEvent?: WorkflowCanonicalEvent | null
}

export const WORKSPACE_ASSISTANT_WORKFLOW_EVENT = 'workspace-assistant:workflow'

export function emitWorkspaceAssistantWorkflowEvent(detail: WorkspaceAssistantWorkflowEventDetail) {
  if (typeof window === 'undefined') return
  const canonicalEvent = detail.canonicalEvent
    || (
      detail.runId
        ? buildRunLifecycleCanonicalEvent({
            workflowId: detail.workflowId,
            runId: detail.runId,
            status: detail.status === 'started' ? 'start' : detail.status === 'completed' ? 'complete' : 'fail',
          })
        : null
    )
  window.dispatchEvent(new CustomEvent<WorkspaceAssistantWorkflowEventDetail>(
    WORKSPACE_ASSISTANT_WORKFLOW_EVENT,
    {
      detail: {
        ...detail,
        canonicalEvent,
      },
    },
  ))
}
