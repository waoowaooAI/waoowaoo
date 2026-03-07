import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  applyTaskLifecycleToOverlay,
  upsertTaskTargetOverlay,
  type TaskTargetOverlayMap,
} from '@/lib/query/task-target-overlay'
import { queryKeys } from '@/lib/query/keys'
import { TASK_EVENT_TYPE } from '@/lib/task/types'

function getOverlay(
  queryClient: QueryClient,
  projectId: string,
  key: string,
) {
  const map = queryClient.getQueryData<TaskTargetOverlayMap>(
    queryKeys.tasks.targetStateOverlay(projectId),
  ) || {}
  return map[key] || null
}

describe('task-target-overlay', () => {
  it('creates optimistic runningTaskId when onMutate omits it', () => {
    const queryClient = new QueryClient()
    const projectId = 'project-1'
    const key = 'NovelPromotionPanel:panel-1'

    upsertTaskTargetOverlay(queryClient, {
      projectId,
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      runningTaskType: 'video_panel',
      intent: 'generate',
    })

    const overlay = getOverlay(queryClient, projectId, key)
    expect(overlay?.runningTaskId).toMatch(/^optimistic:NovelPromotionPanel:panel-1:/)
  })

  it('does not clear overlay on completed event from a different taskId', () => {
    const queryClient = new QueryClient()
    const projectId = 'project-1'
    const key = 'NovelPromotionPanel:panel-2'

    upsertTaskTargetOverlay(queryClient, {
      projectId,
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-2',
      runningTaskId: 'task-new',
      runningTaskType: 'video_panel',
      intent: 'generate',
    })

    applyTaskLifecycleToOverlay(queryClient, {
      projectId,
      lifecycleType: TASK_EVENT_TYPE.COMPLETED,
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-2',
      taskId: 'task-old',
      taskType: 'video_panel',
      intent: 'generate',
      hasOutputAtStart: null,
      progress: null,
      stage: null,
      stageLabel: null,
      eventTs: new Date().toISOString(),
    })

    const overlay = getOverlay(queryClient, projectId, key)
    expect(overlay?.runningTaskId).toBe('task-new')
  })

  it('clears overlay on completed event from the same taskId', () => {
    const queryClient = new QueryClient()
    const projectId = 'project-1'
    const key = 'NovelPromotionPanel:panel-3'

    upsertTaskTargetOverlay(queryClient, {
      projectId,
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-3',
      runningTaskId: 'task-3',
      runningTaskType: 'video_panel',
      intent: 'generate',
    })

    applyTaskLifecycleToOverlay(queryClient, {
      projectId,
      lifecycleType: TASK_EVENT_TYPE.COMPLETED,
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-3',
      taskId: 'task-3',
      taskType: 'video_panel',
      intent: 'generate',
      hasOutputAtStart: null,
      progress: null,
      stage: null,
      stageLabel: null,
      eventTs: new Date().toISOString(),
    })

    const overlay = getOverlay(queryClient, projectId, key)
    expect(overlay).toBeNull()
  })
})
