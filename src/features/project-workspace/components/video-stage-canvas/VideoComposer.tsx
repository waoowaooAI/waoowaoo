'use client'

import VideoStage from '../VideoStage'
import { useWorkspaceStageRuntime } from '../../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../../WorkspaceProvider'
import type { Clip as VideoClip } from '../video'

export default function VideoComposer() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { clips, storyboards } = useWorkspaceEpisodeStageData()
  const normalizedClips: VideoClip[] = clips.map((clip) => ({
    id: clip.id,
    start: clip.start ?? 0,
    end: clip.end ?? 0,
    summary: clip.summary,
  }))

  if (!episodeId) return null

  return (
    <VideoStage
      projectId={projectId}
      episodeId={episodeId}
      storyboards={storyboards}
      clips={normalizedClips}
      defaultVideoModel={runtime.videoModel || ''}
      capabilityOverrides={runtime.capabilityOverrides}
      videoRatio={runtime.videoRatio ?? undefined}
      userVideoModels={runtime.userVideoModels}
      onGenerateVideo={runtime.onGenerateVideo}
      onGenerateAllVideos={runtime.onGenerateAllVideos}
      onBack={() => runtime.onStageChange('storyboard')}
      onUpdateVideoPrompt={runtime.onUpdateVideoPrompt}
      onUpdatePanelVideoModel={runtime.onUpdatePanelVideoModel}
      onOpenAssetLibraryForCharacter={(characterId) =>
        characterId
          ? runtime.onOpenAssetLibraryForCharacter(characterId, false)
          : runtime.onOpenAssetLibrary()
      }
    />
  )
}
