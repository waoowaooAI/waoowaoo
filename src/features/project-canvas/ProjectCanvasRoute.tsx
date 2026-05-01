'use client'

import ProjectCanvas from './ProjectCanvas'
import { useWorkspaceEpisodeStageData } from '@/features/project-workspace/hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '@/features/project-workspace/WorkspaceProvider'

export default function ProjectCanvasRoute() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { novelText, clips, storyboards } = useWorkspaceEpisodeStageData()

  if (!episodeId) return null

  return (
    <ProjectCanvas
      projectId={projectId}
      episodeId={episodeId}
      storyText={novelText}
      clips={clips}
      storyboards={storyboards}
    />
  )
}
