'use client'

import type { UIMessage } from 'ai'
import type { ApprovalRequestPartData } from '@/lib/project-agent/types'

export interface PendingApprovalAction {
  messageId: string
  planId: string
  data: ApprovalRequestPartData
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

export function removeApprovalRequestFromMessages(messages: UIMessage[], planId: string): UIMessage[] {
  return messages.flatMap((message) => {
    const nextParts = message.parts.filter((part) => (
      !isApprovalRequestPart(part) || part.data.planId !== planId
    ))
    if (nextParts.length === 0) return []
    return [{ ...message, parts: nextParts }]
  })
}
