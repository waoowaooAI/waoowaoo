'use client'

import VoiceStage from './VoiceStage'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceProvider } from '../WorkspaceProvider'

export default function VoiceStageRoute() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()

  if (!episodeId) return null

  return (
    <VoiceStage
      projectId={projectId}
      episodeId={episodeId}
      onBack={() => runtime.onStageChange('videos')}
      onOpenAssetLibraryForCharacter={(characterId) =>
        characterId
          ? runtime.onOpenAssetLibraryForCharacter(characterId, false)
          : runtime.onOpenAssetLibrary()
      }
    />
  )
}
