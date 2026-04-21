'use client'

import type { UIMessage } from 'ai'
import type {
  ApprovalRequestPartData,
  ConfirmationRequestPartData,
  WorkflowPlanPartData,
} from '@/lib/project-agent/types'

export interface PendingApprovalAction {
  messageId: string
  planId: string
  data: ApprovalRequestPartData
}

export interface PendingConfirmationAction {
  messageId: string
  operationId: string
  data: ConfirmationRequestPartData
}

export interface WorkflowPlanSnapshot {
  messageId: string
  planId: string
  data: WorkflowPlanPartData
}

function isApprovalRequestPart(
  part: unknown,
): part is { type: 'data-approval-request'; data: ApprovalRequestPartData } {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false
  const record = part as Record<string, unknown>
  if (record.type !== 'data-approval-request') return false
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return false
  const data = record.data as Record<string, unknown>
  return typeof data.planId === 'string'
    && typeof data.commandId === 'string'
    && typeof data.workflowId === 'string'
    && typeof data.summary === 'string'
    && Array.isArray(data.reasons)
}

export function collectPendingApprovalActions(messages: UIMessage[]): PendingApprovalAction[] {
  const actions: PendingApprovalAction[] = []

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isApprovalRequestPart(part)) continue
      actions.push({
        messageId: message.id,
        planId: part.data.planId,
        data: part.data,
      })
    }
  }

  return actions
}

function isConfirmationRequestPart(
  part: unknown,
): part is { type: 'data-confirmation-request'; data: ConfirmationRequestPartData } {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false
  const record = part as Record<string, unknown>
  if (record.type !== 'data-confirmation-request') return false
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return false
  const data = record.data as Record<string, unknown>
  return typeof data.operationId === 'string' && typeof data.summary === 'string'
}

function isWorkflowPlanPart(
  part: unknown,
): part is { type: 'data-workflow-plan'; data: WorkflowPlanPartData } {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false
  const record = part as Record<string, unknown>
  if (record.type !== 'data-workflow-plan') return false
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return false
  const data = record.data as Record<string, unknown>
  return typeof data.planId === 'string' && typeof data.workflowId === 'string' && typeof data.summary === 'string'
}

export function collectPendingConfirmationActions(messages: UIMessage[]): PendingConfirmationAction[] {
  const actions: PendingConfirmationAction[] = []

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isConfirmationRequestPart(part)) continue
      actions.push({
        messageId: message.id,
        operationId: part.data.operationId,
        data: part.data,
      })
    }
  }

  return actions
}

export function collectWorkflowPlanSnapshots(messages: UIMessage[]): WorkflowPlanSnapshot[] {
  const plans: WorkflowPlanSnapshot[] = []

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isWorkflowPlanPart(part)) continue
      plans.push({
        messageId: message.id,
        planId: part.data.planId,
        data: part.data,
      })
    }
  }

  return plans
}

export function removeApprovalRequestFromMessages(messages: UIMessage[], planId: string): UIMessage[] {
  return messages.flatMap((message) => {
    const nextParts = message.parts.filter((part) => (
      !isApprovalRequestPart(part) || part.data.planId !== planId
    ))
    if (nextParts.length === 0) return []
    return [{ ...message, parts: nextParts }]
  })
}

export function removeConfirmationRequestFromMessages(messages: UIMessage[], operationId: string): UIMessage[] {
  return messages.flatMap((message) => {
    const nextParts = message.parts.filter((part) => (
      !isConfirmationRequestPart(part) || part.data.operationId !== operationId
    ))
    if (nextParts.length === 0) return []
    return [{ ...message, parts: nextParts }]
  })
}
