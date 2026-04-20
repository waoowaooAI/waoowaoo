import { z } from 'zod'
import { createHash } from 'crypto'
import { ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { validatePreviewText, validateVoicePrompt } from '@/lib/providers/bailian/voice-design'
import type { ProjectAgentOperationRegistry } from './types'
import { submitOperationTask } from './submit-operation-task'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createAssetHubVoiceOperations(): ProjectAgentOperationRegistry {
  return {
    asset_hub_voice_design: {
      id: 'asset_hub_voice_design',
      description: 'Submit asset hub voice design task (ASSET_HUB_VOICE_DESIGN).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        longRunning: true,
        requiresConfirmation: true,
        confirmationSummary: '将提交声音设计任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'system',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const voicePrompt = normalizeString(body.voicePrompt)
        const previewText = normalizeString(body.previewText)
        const preferredName = normalizeString(body.preferredName) || 'custom_voice'
        const language = body.language === 'en' ? 'en' : 'zh'

        const promptValidation = validateVoicePrompt(voicePrompt)
        if (!promptValidation.valid) {
          throw new ApiError('INVALID_PARAMS')
        }
        const textValidation = validatePreviewText(previewText)
        if (!textValidation.valid) {
          throw new ApiError('INVALID_PARAMS')
        }

        const digest = createHash('sha1')
          .update(`${ctx.userId}:${voicePrompt}:${previewText}:${preferredName}:${language}`)
          .digest('hex')
          .slice(0, 16)

        const payload = {
          voicePrompt,
          previewText,
          preferredName,
          language,
          displayMode: 'detail' as const,
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
          targetType: 'GlobalAssetHubVoiceDesign',
          targetId: ctx.userId,
          payload,
          dedupeKey: `${TASK_TYPE.ASSET_HUB_VOICE_DESIGN}:${digest}`,
        })
      },
    },
  }
}

