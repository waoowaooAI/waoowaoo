'use client'

import { useMemo } from 'react'
import { VideoEditorStage, createProjectFromPanels } from '@/features/video-editor'
import { useWorkspaceEpisodeStageData } from '../../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../../WorkspaceProvider'
import { useWorkspaceStageRuntime } from '../../WorkspaceStageRuntimeContext'

export default function FinalTimelineView() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { storyboards } = useWorkspaceEpisodeStageData()

  const initialProject = useMemo(() => {
    if (!episodeId) return null
    const panels = storyboards.flatMap((storyboard) => {
      const storyboardPanels = storyboard.panels ?? []
      return storyboardPanels.map((panel) => ({
        id: panel.id,
        panelIndex: panel.panelIndex,
        storyboardId: storyboard.id,
        videoUrl: panel.videoUrl ?? undefined,
        description: panel.description ?? undefined,
        duration: panel.duration ?? undefined,
      }))
    })

    return createProjectFromPanels(episodeId, panels)
  }, [episodeId, storyboards])

  if (!episodeId || !initialProject) return null

  return (
    <VideoEditorStage
      projectId={projectId}
      episodeId={episodeId}
      initialProject={initialProject}
      onBack={() => runtime.onStageChange('videos')}
    />
  )
}
