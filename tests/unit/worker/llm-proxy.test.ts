import type { Job } from 'bullmq'
import { describe, expect, it } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { handleLLMProxyTask, isLLMProxyTaskType } from '@/lib/workers/handlers/llm-proxy'

function buildJob(type: TaskJobData['type']): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-llm-proxy-1',
      type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-1',
      payload: { episodeId: 'episode-1' },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker llm-proxy behavior', () => {
  it('current route map has no enabled proxy task type', () => {
    expect(isLLMProxyTaskType(TASK_TYPE.STORY_TO_SCRIPT_RUN)).toBe(false)
    expect(isLLMProxyTaskType(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)).toBe(false)
  })

  it('unsupported proxy task type -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.STORY_TO_SCRIPT_RUN)
    await expect(handleLLMProxyTask(job)).rejects.toThrow('Unsupported llm proxy task type')
  })
})
