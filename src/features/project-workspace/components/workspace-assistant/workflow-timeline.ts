'use client'

import type { UIMessage } from 'ai'
import {
  buildRunLifecycleCanonicalEvent,
  type WorkflowCanonicalEvent,
} from '@/lib/agent/events/workflow-events'
import {
  getProjectWorkflowMachine,
  getWorkflowDisplayLabel,
} from '@/lib/skill-system/project-workflow-machine'
import type { WorkspaceAssistantWorkflowEventDetail, WorkspaceAssistantWorkflowId } from './workspace-assistant-events'

function createLocalMessage(role: UIMessage['role'], parts: UIMessage['parts']): UIMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    parts,
  }
}

export { createLocalMessage }

function resolveStatusCanonicalEvent(detail: {
  workflowId: WorkspaceAssistantWorkflowId
  status: 'start' | 'complete' | 'fail'
  runId?: string
}): WorkflowCanonicalEvent | null {
  if (!detail.runId) return null
  return buildRunLifecycleCanonicalEvent({
    workflowId: detail.workflowId,
    runId: detail.runId,
    status: detail.status,
  })
}

export function buildWorkflowTimelineMessages(workflowId: WorkspaceAssistantWorkflowId, runId?: string): UIMessage[] {
  const workflowMachine = getProjectWorkflowMachine(workflowId)
  const workflowLabel = getWorkflowDisplayLabel(workflowId)
  return [
    createLocalMessage('user', [
      {
        type: 'text',
        text: `开始执行 ${workflowLabel}`,
      },
    ]),
    createLocalMessage('assistant', [
      {
        type: 'text',
        text: `已从工作区触发 ${workflowLabel}。接下来会在这里持续显示 workflow 和 skill 进度。`,
      },
      {
        type: 'data-workflow-plan',
        data: {
          workflowId,
          commandId: '',
          planId: '',
          summary: workflowMachine.manifest.name,
          requiresApproval: false,
          event: null,
          steps: workflowMachine.steps.map((step) => ({
            skillId: step.skillId,
            title: step.title,
          })),
        },
      },
      {
        type: 'data-workflow-status',
        data: {
          workflowId,
          commandId: '',
          planId: '',
          runId: runId || '',
          status: 'running',
          event: resolveStatusCanonicalEvent({
            workflowId,
            runId,
            status: 'start',
          }),
        },
      },
    ]),
  ]
}

export function buildWorkflowErrorMessage(detail: WorkspaceAssistantWorkflowEventDetail): UIMessage {
  const workflowLabel = getWorkflowDisplayLabel(detail.workflowId)
  return createLocalMessage('assistant', [
    {
      type: 'text',
      text: `${workflowLabel} 启动失败：${detail.errorMessage || '未知错误'}`,
    },
    {
      type: 'data-workflow-status',
      data: {
        workflowId: detail.workflowId,
        commandId: '',
        planId: '',
        runId: detail.runId || '',
        status: 'failed',
        event: detail.canonicalEvent || resolveStatusCanonicalEvent({
          workflowId: detail.workflowId,
          runId: detail.runId,
          status: 'fail',
        }),
      },
    },
  ])
}

export function buildWorkflowCompletedMessage(workflowId: WorkspaceAssistantWorkflowId, runId?: string): UIMessage {
  const workflowLabel = getWorkflowDisplayLabel(workflowId)
  return createLocalMessage('assistant', [
    {
      type: 'text',
      text: `${workflowLabel} 已执行完成。`,
    },
    {
      type: 'data-workflow-status',
      data: {
        workflowId,
        commandId: '',
        planId: '',
        runId: runId || '',
        status: 'completed',
        event: resolveStatusCanonicalEvent({
          workflowId,
          runId,
          status: 'complete',
        }),
      },
    },
  ])
}
