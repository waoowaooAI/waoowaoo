'use client'

import { useCallback } from 'react'
import { useWorkspaceStageRuntime } from '../../WorkspaceStageRuntimeContext'
import type { WorkspaceCanvasNodeAction } from '../node-canvas-types'

export function useWorkspaceNodeCanvasActions() {
  const runtime = useWorkspaceStageRuntime()

  return useCallback((action: WorkspaceCanvasNodeAction) => {
    if (action.type === 'update_story') {
      void runtime.onNovelTextChange(action.value)
      return
    }

    if (action.type === 'generate_script') {
      void runtime.onRunStoryToScript()
      return
    }

    if (action.type === 'generate_storyboard') {
      void runtime.onRunScriptToStoryboard()
      return
    }

    if (action.type === 'generate_image') {
      void runtime.onGeneratePanelImage(action.panelId)
      return
    }

    if (action.type === 'generate_video') {
      void runtime.onGenerateVideo(
        action.storyboardId,
        action.panelIndex,
        undefined,
        undefined,
        undefined,
        action.panelId,
      )
      return
    }

    if (action.type === 'generate_all_videos') {
      void runtime.onGenerateAllVideos()
    }
  }, [runtime])
}
