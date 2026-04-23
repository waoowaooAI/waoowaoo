import { z } from 'zod'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { storyboardMutationOperationOutputSchema } from '@/lib/operations/output-schemas'
import {
  cancelStoryboardPanelCandidatesInputSchema,
  createStoryboardPanelInputSchema,
  deleteStoryboardPanelInputSchema,
  insertStoryboardPanelInputSchema,
  reorderStoryboardPanelsInputSchema,
  selectStoryboardPanelCandidateInputSchema,
  updateStoryboardPanelFieldsInputSchema,
  updateStoryboardPanelPromptInputSchema,
  executeStoryboardMutationOperation,
} from './panel-mutations'

const EFFECTS_WRITE = {
  writes: true,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

export function createStoryboardPanelEditOperations(): ProjectAgentOperationRegistryDraft {
  return {
    create_storyboard_panel: defineOperation({
      id: 'create_storyboard_panel',
      summary: 'Create a new storyboard panel at the end of a storyboard.',
      intent: 'act',
      effects: EFFECTS_WRITE,
      inputSchema: createStoryboardPanelInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'create_panel',
      }, 'create_storyboard_panel'),
    }),
    delete_storyboard_panel: defineOperation({
      id: 'delete_storyboard_panel',
      summary: 'Delete a storyboard panel by panelId or by storyboardId plus panelIndex.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        destructive: true,
      },
      confirmation: {
        required: true,
        summary: '将删除一个分镜格并重排后续编号。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: deleteStoryboardPanelInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'delete_panel',
      }, 'delete_storyboard_panel'),
    }),
    update_storyboard_panel_prompt: defineOperation({
      id: 'update_storyboard_panel_prompt',
      summary: 'Update prompt fields for a storyboard panel.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        overwrite: true,
      },
      confirmation: {
        required: true,
        summary: '将修改分镜格提示词。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: updateStoryboardPanelPromptInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'update_panel_prompt',
      }, 'update_storyboard_panel_prompt'),
    }),
    update_storyboard_panel_fields: defineOperation({
      id: 'update_storyboard_panel_fields',
      summary: 'Update structured storyboard panel fields such as shot, description, timing, or linkage.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        overwrite: true,
      },
      confirmation: {
        required: true,
        summary: '将修改分镜格字段信息。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: updateStoryboardPanelFieldsInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'update_panel_fields',
      }, 'update_storyboard_panel_fields'),
    }),
    reorder_storyboard_panels: defineOperation({
      id: 'reorder_storyboard_panels',
      summary: 'Reorder all panels in a storyboard using an explicit orderedPanelIds list.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        bulk: true,
      },
      confirmation: {
        required: true,
        summary: '将重排整个分镜组内的格子顺序。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: reorderStoryboardPanelsInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'reorder_panels',
      }, 'reorder_storyboard_panels'),
    }),
    select_storyboard_panel_candidate: defineOperation({
      id: 'select_storyboard_panel_candidate',
      summary: 'Select one storyboard panel candidate image as the final panel image.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        overwrite: true,
      },
      confirmation: {
        required: true,
        summary: '将确认候选图并覆盖当前分镜图。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: selectStoryboardPanelCandidateInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'select_panel_candidate',
      }, 'select_storyboard_panel_candidate'),
    }),
    cancel_storyboard_panel_candidates: defineOperation({
      id: 'cancel_storyboard_panel_candidates',
      summary: 'Cancel and clear candidate images for a storyboard panel.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        destructive: true,
      },
      confirmation: {
        required: true,
        summary: '将清空该分镜格的候选图。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: cancelStoryboardPanelCandidatesInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'cancel_panel_candidates',
      }, 'cancel_storyboard_panel_candidates'),
    }),
    insert_storyboard_panel: defineOperation({
      id: 'insert_storyboard_panel',
      summary: 'Insert a new storyboard panel after an existing panel and enqueue generation.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        billable: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将插入新的分镜格并提交生成任务。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: insertStoryboardPanelInputSchema,
      outputSchema: storyboardMutationOperationOutputSchema,
      execute: async (ctx, input) => executeStoryboardMutationOperation(ctx, {
        ...input,
        action: 'insert_panel',
      }, 'insert_storyboard_panel'),
    }),
  }
}
