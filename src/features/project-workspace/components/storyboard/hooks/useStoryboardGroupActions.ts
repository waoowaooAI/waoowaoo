'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useCallback, useState } from 'react'
import {
  useCreateProjectStoryboardGroup,
  useDeleteProjectStoryboardGroup,
  useMoveProjectStoryboardGroup,
  useRegenerateProjectStoryboardText,
} from '@/lib/query/hooks'
import { isAsyncTaskResponse, waitForTaskResult } from '@/lib/task/client'
import { getErrorMessage, isAbortError } from './panel-operations-shared'

interface UseStoryboardGroupActionsProps {
  projectId: string
  episodeId: string
  onRefresh: () => Promise<void> | void
}

export function useStoryboardGroupActions({
  projectId,
  episodeId,
  onRefresh,
}: UseStoryboardGroupActionsProps) {
  const t = useTranslations('storyboard')
  const [submittingStoryboardTextIds, setSubmittingStoryboardTextIds] = useState<Set<string>>(new Set())
  const [addingStoryboardGroup, setAddingStoryboardGroup] = useState(false)
  const [movingClipId, setMovingClipId] = useState<string | null>(null)

  const deleteStoryboardMutation = useDeleteProjectStoryboardGroup(projectId)
  const regenerateStoryboardTextMutation = useRegenerateProjectStoryboardText(projectId)
  const addStoryboardGroupMutation = useCreateProjectStoryboardGroup(projectId)
  const moveStoryboardGroupMutation = useMoveProjectStoryboardGroup(projectId)

  const deleteStoryboard = useCallback(async (storyboardId: string, panelCount: number) => {
    if (!confirm(t('confirm.deleteGroup', { count: panelCount }))) {
      return
    }
    try {
      await deleteStoryboardMutation.mutateAsync({ storyboardId })
      await onRefresh()
    } catch (error: unknown) {
      _ulogError('删除分镜组失败:', error)
      alert(
        t('messages.deleteGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    }
  }, [deleteStoryboardMutation, onRefresh, t])

  const regenerateStoryboardText = useCallback(async (storyboardId: string) => {
    if (submittingStoryboardTextIds.has(storyboardId)) return
    setSubmittingStoryboardTextIds((previous) => new Set(previous).add(storyboardId))

    try {
      const taskData = await regenerateStoryboardTextMutation.mutateAsync({ storyboardId })
      if (!isAsyncTaskResponse(taskData)) {
        throw new Error('TASK_ID_MISSING')
      }
      await waitForTaskResult(taskData.taskId, { intervalMs: 2000 })
      _ulogInfo('[重新生成分镜] 任务完成')
      await onRefresh()
    } catch (error: unknown) {
      if (isAbortError(error)) {
        _ulogInfo('请求被中断（可能是页面刷新），后端仍在执行')
        return
      }
      _ulogError('重新生成分镜失败:', error)
      alert(
        t('messages.regenerateGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setSubmittingStoryboardTextIds((previous) => {
        const next = new Set(previous)
        next.delete(storyboardId)
        return next
      })
    }
  }, [onRefresh, regenerateStoryboardTextMutation, submittingStoryboardTextIds, t])

  const addStoryboardGroup = useCallback(async (insertIndex: number) => {
    if (addingStoryboardGroup) return
    setAddingStoryboardGroup(true)
    try {
      await addStoryboardGroupMutation.mutateAsync({ episodeId, insertIndex })
      await onRefresh()
    } catch (error: unknown) {
      _ulogError('添加分镜组失败:', error)
      alert(
        t('messages.addGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setAddingStoryboardGroup(false)
    }
  }, [addingStoryboardGroup, addStoryboardGroupMutation, episodeId, onRefresh, t])

  const moveStoryboardGroup = useCallback(async (clipId: string, direction: 'up' | 'down') => {
    if (movingClipId) return
    setMovingClipId(clipId)
    try {
      await moveStoryboardGroupMutation.mutateAsync({ episodeId, clipId, direction })
      await onRefresh()
    } catch (error: unknown) {
      _ulogError('移动分镜组失败:', error)
      alert(
        t('messages.moveGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setMovingClipId(null)
    }
  }, [episodeId, moveStoryboardGroupMutation, movingClipId, onRefresh, t])

  return {
    submittingStoryboardTextIds,
    addingStoryboardGroup,
    movingClipId,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
  }
}
