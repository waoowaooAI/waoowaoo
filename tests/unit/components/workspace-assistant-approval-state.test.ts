import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  collectPendingApprovalActions,
  collectPendingConfirmationActions,
  collectWorkflowPlanSnapshots,
  removeApprovalRequestFromMessages,
  removeConfirmationRequestFromMessages,
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
        {
          type: 'data-workflow-plan',
          data: {
            workflowId: 'story-to-script',
            commandId: 'command-1',
            planId: 'plan-1',
            summary: 'Story To Script',
            requiresApproval: true,
            steps: [
              { skillId: 'analyze-characters', title: 'Analyze Characters' },
            ],
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
        {
          type: 'data-confirmation-request',
          data: {
            operationId: 'regenerate_panel_image',
            summary: 'Need confirmation',
            argsHint: {
              panelId: 'panel-1',
              confirmed: true,
            },
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
      {
        type: 'data-workflow-plan',
        data: {
          workflowId: 'story-to-script',
          commandId: 'command-1',
          planId: 'plan-1',
          summary: 'Story To Script',
          requiresApproval: true,
          steps: [
            { skillId: 'analyze-characters', title: 'Analyze Characters' },
          ],
        },
      },
    ])
    expect(nextMessages[1]?.id).toBe('assistant-2')
  })

  it('collects pending confirmations and workflow plans from persisted messages', () => {
    const confirmations = collectPendingConfirmationActions(buildMessages())
    const plans = collectWorkflowPlanSnapshots(buildMessages())

    expect(confirmations).toHaveLength(1)
    expect(confirmations[0]?.operationId).toBe('regenerate_panel_image')
    expect(plans).toHaveLength(1)
    expect(plans[0]?.planId).toBe('plan-1')
  })

  it('removes resolved confirmation requests while preserving other parts', () => {
    const nextMessages = removeConfirmationRequestFromMessages(buildMessages(), 'regenerate_panel_image')

    expect(nextMessages).toHaveLength(2)
    expect(nextMessages[1]?.parts).toEqual([
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
    ])
  })
})
