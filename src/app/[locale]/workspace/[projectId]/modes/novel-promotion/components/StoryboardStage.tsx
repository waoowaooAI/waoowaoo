'use client'

import StoryboardStageView from './storyboard'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'

export default function StoryboardStage() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { clips, storyboards } = useWorkspaceEpisodeStageData()

  if (!episodeId) return null

  return (
    <StoryboardStageView
      projectId={projectId}
      episodeId={episodeId}
      storyboards={storyboards}
      clips={clips}
      videoRatio={runtime.videoRatio || '9:16'}
      onBack={() => runtime.onStageChange('script')}
      onNext={async () => runtime.onStageChange('videos')}
      isTransitioning={runtime.isTransitioning}
    />
  )
}
