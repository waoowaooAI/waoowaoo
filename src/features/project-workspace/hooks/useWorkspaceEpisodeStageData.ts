'use client'

import { useEpisodeData } from '@/lib/query/hooks'
import type { ProjectClip, ProjectStoryboard } from '@/types/project'
import { useWorkspaceProvider } from '../WorkspaceProvider'

interface EpisodeStagePayload {
  name?: string
  novelText?: string | null
  clips?: ProjectClip[]
  storyboards?: ProjectStoryboard[]
}

export function useWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const payload = episodeData as EpisodeStagePayload | null

  return {
    episodeName: payload?.name,
    novelText: payload?.novelText || '',
    clips: payload?.clips || [],
    storyboards: payload?.storyboards || [],
  }
}
