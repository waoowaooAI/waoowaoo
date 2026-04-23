import { z } from 'zod'
import { getUserApiConfig, putUserApiConfig } from '@/lib/user-api/api-config'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

export function createUserApiConfigOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_user_api_config: defineOperation({
      id: 'get_user_api_config',
      summary: 'Read user API config (decrypted providers, pricing/capabilities enrichment).',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => await getUserApiConfig(ctx.userId),
    }),
    put_user_api_config: defineOperation({
      id: 'put_user_api_config',
      summary: 'Save/update user API config.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将覆盖更新用户 API 配置（可能影响后续调用与计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => await putUserApiConfig(ctx.userId, input),
    }),
  }
}
