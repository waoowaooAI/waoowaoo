import { z } from 'zod'
import { testLlmConnection } from '@/lib/ai-exec/llm-test-connection'
import { testProviderConnection } from '@/lib/ai-exec/provider-test'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'

export function createUserApiConfigConnectionDiagnosticOperations(): ProjectAgentOperationRegistryDraft {
  return {
    api_user_api_config_test_connection: {
      id: 'api_user_api_config_test_connection',
      summary: 'API-only: Test LLM connection with user-provided provider/baseUrl/apiKey.',
      intent: 'act',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const startedAt = Date.now()
        const payload = input as Parameters<typeof testLlmConnection>[0]
        const result = await testLlmConnection(payload)
        return {
          success: true,
          latencyMs: Date.now() - startedAt,
          ...result,
        }
      },
    },

    api_user_api_config_test_provider: {
      id: 'api_user_api_config_test_provider',
      summary: 'API-only: Run provider multi-step connection diagnostics.',
      intent: 'act',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const startedAt = Date.now()
        const payload = input as Parameters<typeof testProviderConnection>[0]
        const result = await testProviderConnection(payload)
        return {
          ...result,
          latencyMs: Date.now() - startedAt,
        }
      },
    },
  }
}
