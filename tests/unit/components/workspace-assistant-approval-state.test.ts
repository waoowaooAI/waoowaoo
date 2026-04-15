import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  collectPendingApprovalActions,
  removeApprovalRequestFromMessages,
} from '@/features/project-workspace/components/workspace-assistant/approval-state'

function buildMessages(): UIMessage[] {
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'plan created' },
        {
          type: 'data-approval-request',
          data: {
            workflowId: 'story-to-script',
            commandId: 'command-1',
            planId: 'plan-1',
            summary: 'Needs approval',
            reasons: ['invalidate screenplay'],
          },
        },
      ],
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      parts: [
        {
          type: 'data-approval-request',
          data: {
            workflowId: 'script-to-storyboard',
            commandId: 'command-2',
            planId: 'plan-2',
            summary: 'Needs approval 2',
            reasons: ['invalidate storyboard'],
          },
        },
      ],
    },
  ]
}

describe('workspace assistant approval state', () => {
  it('collects pending approvals from persisted messages', () => {
    const approvals = collectPendingApprovalActions(buildMessages())

    expect(approvals).toHaveLength(2)
    expect(approvals[0]?.planId).toBe('plan-1')
    expect(approvals[1]?.data.workflowId).toBe('script-to-storyboard')
  })

  it('removes resolved approval requests while preserving other parts', () => {
    const nextMessages = removeApprovalRequestFromMessages(buildMessages(), 'plan-1')

    expect(nextMessages).toHaveLength(2)
    expect(nextMessages[0]?.id).toBe('assistant-1')
    expect(nextMessages[0]?.parts).toEqual([
      { type: 'text', text: 'plan created' },
    ])
    expect(nextMessages[1]?.id).toBe('assistant-2')
  })
})
