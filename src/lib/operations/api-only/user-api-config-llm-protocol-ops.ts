import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { getProviderKey } from '@/lib/ai-registry/selection'
import { probeModelLlmProtocol } from '@/lib/ai-exec/llm-protocol-probe'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function readRequiredString(value: unknown, field: string, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code,
      field,
    })
  }
  return value.trim()
}

export function createUserApiConfigLlmProtocolOperations(): ProjectAgentOperationRegistryDraft {
  return {
    api_user_api_config_probe_model_llm_protocol: defineOperation({
      id: 'api_user_api_config_probe_model_llm_protocol',
      summary: 'API-only: Probe whether openai-compatible model supports responses or chat-completions protocol.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      inputSchema: z.object({
        providerId: z.unknown(),
        modelId: z.unknown(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const providerId = readRequiredString(input.providerId, 'providerId', 'MODEL_LLM_PROTOCOL_PROBE_INVALID')
        const modelId = readRequiredString(input.modelId, 'modelId', 'MODEL_LLM_PROTOCOL_PROBE_INVALID')

        if (getProviderKey(providerId) !== 'openai-compatible') {
          throw new ApiError('INVALID_PARAMS', {
            code: 'MODEL_LLM_PROTOCOL_PROBE_PROVIDER_INVALID',
            field: 'providerId',
          })
        }

        return await probeModelLlmProtocol({
          userId: ctx.userId,
          providerId,
          modelId,
        })
      },
    }),
  }
}
