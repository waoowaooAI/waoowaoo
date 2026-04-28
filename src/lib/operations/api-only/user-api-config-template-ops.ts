import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { getProviderKey } from '@/lib/ai-registry/selection'
import { probeModelLlmProtocol } from '@/lib/user-api/model-llm-protocol-probe'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template'
import { probeMediaTemplate } from '@/lib/user-api/model-template/probe'
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

export function createUserApiConfigTemplateDiagnosticOperations(): ProjectAgentOperationRegistryDraft {
  return {
    api_user_api_config_validate_media_template: defineOperation({
      id: 'api_user_api_config_validate_media_template',
      summary: 'API-only: Validate openai-compatible media template schema.',
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
      inputSchema: z.object({
        providerId: z.unknown(),
        template: z.unknown(),
      }),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const providerId = readRequiredString(input.providerId, 'providerId', 'MODEL_TEMPLATE_INVALID')
        if (getProviderKey(providerId) !== 'openai-compatible') {
          throw new ApiError('INVALID_PARAMS', {
            code: 'MODEL_TEMPLATE_PROVIDER_INVALID',
            field: 'providerId',
          })
        }

        const result = validateOpenAICompatMediaTemplate(input.template)
        return {
          success: result.ok,
          ...(result.template ? { template: result.template } : {}),
          issues: result.issues,
        }
      },
    }),

    api_user_api_config_probe_media_template: defineOperation({
      id: 'api_user_api_config_probe_media_template',
      summary: 'API-only: Probe openai-compatible media template against real provider endpoint.',
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
        template: z.unknown(),
        samplePrompt: z.unknown().optional(),
        sampleImage: z.unknown().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const providerId = readRequiredString(input.providerId, 'providerId', 'MODEL_TEMPLATE_PROBE_INVALID')
        const modelId = readRequiredString(input.modelId, 'modelId', 'MODEL_TEMPLATE_PROBE_INVALID')
        if (getProviderKey(providerId) !== 'openai-compatible') {
          throw new ApiError('INVALID_PARAMS', {
            code: 'MODEL_TEMPLATE_PROBE_PROVIDER_INVALID',
            field: 'providerId',
          })
        }

        const validated = validateOpenAICompatMediaTemplate(input.template)
        if (!validated.ok || !validated.template) {
          return {
            success: false,
            verified: false,
            code: 'MODEL_TEMPLATE_INVALID',
            issues: validated.issues,
          }
        }

        const samplePrompt = typeof input.samplePrompt === 'string' ? input.samplePrompt.trim() : undefined
        const sampleImage = typeof input.sampleImage === 'string' ? input.sampleImage.trim() : undefined

        return await probeMediaTemplate({
          userId: ctx.userId,
          providerId,
          modelId,
          template: validated.template,
          ...(samplePrompt ? { samplePrompt } : {}),
          ...(sampleImage ? { sampleImage } : {}),
        })
      },
    }),

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
