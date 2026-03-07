import type { Job } from 'bullmq'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import {
  handleModifyAppearanceTask,
  handleModifyLocationTask,
  handleModifyShotPromptTask,
  type AnyObj,
} from './shot-ai-prompt'
import { handleAnalyzeShotVariantsTask } from './shot-ai-variants'

export async function handleShotAITask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  switch (job.data.type) {
    case TASK_TYPE.AI_MODIFY_APPEARANCE:
      return await handleModifyAppearanceTask(job, payload)
    case TASK_TYPE.AI_MODIFY_LOCATION:
      return await handleModifyLocationTask(job, payload)
    case TASK_TYPE.AI_MODIFY_SHOT_PROMPT:
      return await handleModifyShotPromptTask(job, payload)
    case TASK_TYPE.ANALYZE_SHOT_VARIANTS:
      return await handleAnalyzeShotVariantsTask(job, payload)
    default:
      throw new Error(`Unsupported shot AI task type: ${job.data.type}`)
  }
}
