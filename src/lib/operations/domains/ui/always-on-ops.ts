import { z } from 'zod'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

const EFFECTS_NONE = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const confirmInputSchema = z.object({
  confirmed: z.boolean(),
  reason: z.string().min(1).optional(),
})

const cancelInputSchema = z.object({
  cancelled: z.boolean(),
  reason: z.string().min(1).optional(),
})

const singleSelectInputSchema = z.object({
  selectionId: z.string().min(1),
})

const multiSelectInputSchema = z.object({
  selectionIds: z.array(z.string().min(1)).min(1),
})

const safetyAckInputSchema = z.object({
  acknowledged: z.boolean(),
  note: z.string().min(1).optional(),
})

export function createAlwaysOnOperations(): ProjectAgentOperationRegistryDraft {
  return {
    ui_confirm: defineOperation({
      id: 'ui_confirm',
      summary: 'Confirm a previously requested high-risk operation.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: confirmInputSchema,
      outputSchema: z.object({
        success: z.literal(true),
        confirmed: z.literal(true),
      }),
      execute: async (_ctx, input) => {
        if (input.confirmed !== true) {
          throw new Error('UI_CONFIRM_REQUIRES_CONFIRMED_TRUE')
        }
        return { success: true, confirmed: true }
      },
    }),
    ui_cancel: defineOperation({
      id: 'ui_cancel',
      summary: 'Cancel a previously requested operation.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: cancelInputSchema,
      outputSchema: z.object({
        success: z.literal(true),
        cancelled: z.literal(true),
      }),
      execute: async (_ctx, input) => {
        if (input.cancelled !== true) {
          throw new Error('UI_CANCEL_REQUIRES_CANCELLED_TRUE')
        }
        return { success: true, cancelled: true }
      },
    }),
    ui_single_select: defineOperation({
      id: 'ui_single_select',
      summary: 'Select one option from a previously presented option list.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: singleSelectInputSchema,
      outputSchema: z.object({
        success: z.literal(true),
        selectionId: z.string().min(1),
      }),
      execute: async (_ctx, input) => ({ success: true, selectionId: input.selectionId }),
    }),
    ui_multi_select: defineOperation({
      id: 'ui_multi_select',
      summary: 'Select multiple options from a previously presented option list.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: multiSelectInputSchema,
      outputSchema: z.object({
        success: z.literal(true),
        selectionIds: z.array(z.string().min(1)).min(1),
      }),
      execute: async (_ctx, input) => ({ success: true, selectionIds: input.selectionIds }),
    }),
    ui_safety_ack: defineOperation({
      id: 'ui_safety_ack',
      summary: 'Acknowledge a safety notice before continuing guarded flows.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: safetyAckInputSchema,
      outputSchema: z.object({
        success: z.literal(true),
        acknowledged: z.literal(true),
      }),
      execute: async (_ctx, input) => {
        if (input.acknowledged !== true) {
          throw new Error('UI_SAFETY_ACK_REQUIRES_ACKNOWLEDGED_TRUE')
        }
        return { success: true, acknowledged: true }
      },
    }),
  }
}
