import type { WorkflowPackageId } from '@/lib/skill-system/types'

export type RunLifecycleStatus = 'start' | 'complete' | 'fail'
export type WorkflowApprovalStatus = 'pending' | 'approved' | 'rejected'

interface WorkflowCanonicalEventBase {
  workflowId: WorkflowPackageId
  createdAt: string
}

export interface WorkflowPlanCanonicalEvent extends WorkflowCanonicalEventBase {
  type: 'workflow.plan'
  commandId: string
  planId: string
}

export interface WorkflowApprovalCanonicalEvent extends WorkflowCanonicalEventBase {
  type: 'workflow.approval'
  planId: string
  status: WorkflowApprovalStatus
}

export interface RunLifecycleCanonicalEvent extends WorkflowCanonicalEventBase {
  type: 'run.lifecycle'
  runId: string
  status: RunLifecycleStatus
}

export type WorkflowCanonicalEvent =
  | WorkflowPlanCanonicalEvent
  | WorkflowApprovalCanonicalEvent
  | RunLifecycleCanonicalEvent

function nowIsoString(): string {
  return new Date().toISOString()
}

export function buildWorkflowPlanCanonicalEvent(params: {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
}): WorkflowPlanCanonicalEvent {
  return {
    type: 'workflow.plan',
    workflowId: params.workflowId,
    commandId: params.commandId,
    planId: params.planId,
    createdAt: nowIsoString(),
  }
}

export function buildWorkflowApprovalCanonicalEvent(params: {
  workflowId: WorkflowPackageId
  planId: string
  status: WorkflowApprovalStatus
}): WorkflowApprovalCanonicalEvent {
  return {
    type: 'workflow.approval',
    workflowId: params.workflowId,
    planId: params.planId,
    status: params.status,
    createdAt: nowIsoString(),
  }
}

export function buildRunLifecycleCanonicalEvent(params: {
  workflowId: WorkflowPackageId
  runId: string
  status: RunLifecycleStatus
}): RunLifecycleCanonicalEvent {
  return {
    type: 'run.lifecycle',
    workflowId: params.workflowId,
    runId: params.runId,
    status: params.status,
    createdAt: nowIsoString(),
  }
}
