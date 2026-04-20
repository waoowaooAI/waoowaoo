import { z } from 'zod'
import { createHash } from 'crypto'
import { ApiError } from '@/lib/api-errors'
import { getUserModelConfig } from '@/lib/config-service'
import { TASK_TYPE } from '@/lib/task/types'
import type { ProjectAgentOperationRegistry } from './types'
import { submitOperationTask } from './submit-operation-task'

export function createHomeLlmOperations(): ProjectAgentOperationRegistry {
  return {
    ai_story_expand: {
      id: 'ai_story_expand',
      description: 'Submit home story expand task (AI_STORY_EXPAND).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        longRunning: true,
        requiresConfirmation: true,
        confirmationSummary: '将提交 AI 续写任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'system',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        prompt: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const prompt = input.prompt.trim()
        if (!prompt) {
          throw new ApiError('INVALID_PARAMS')
        }

        const userConfig = await getUserModelConfig(ctx.userId)
        if (!userConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }

        const dedupeDigest = createHash('sha1')
          .update(`${ctx.userId}:home-story-expand:${prompt}`)
          .digest('hex')
          .slice(0, 16)

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'home-ai-write',
          type: TASK_TYPE.AI_STORY_EXPAND,
          targetType: 'HomeAiStoryExpand',
          targetId: ctx.userId,
          payload: {
            prompt,
            analysisModel: userConfig.analysisModel,
          },
          dedupeKey: `home_ai_story_expand:${dedupeDigest}`,
          priority: 1,
        })
      },
    },
  }
}
