'use client'

import { useCallback, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import ProjectInputStage from '../ProjectInputStage'
import SmartImportWizard from '../SmartImportWizard'
import { useWorkspaceStageRuntime } from '../../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../../hooks/useWorkspaceEpisodeStageData'
import { apiFetch } from '@/lib/api-fetch'
import { queryKeys } from '@/lib/query/keys'
import { useRouter } from '@/i18n/navigation'
import type { SplitEpisode } from '../smart-import/types'

export default function StoryComposer() {
  const runtime = useWorkspaceStageRuntime()
  const { episodeName, novelText } = useWorkspaceEpisodeStageData()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''
  const router = useRouter()
  const queryClient = useQueryClient()
  const [smartSplitMode, setSmartSplitMode] = useState(false)
  const [smartSplitText, setSmartSplitText] = useState('')

  const handleSmartSplit = useCallback((text: string) => {
    setSmartSplitText(text)
    setSmartSplitMode(true)
  }, [])

  const handleSmartSplitComplete = useCallback(async (
    episodes: SplitEpisode[],
    triggerGlobalAnalysis?: boolean,
  ) => {
    void episodes
    await queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })

    const response = await apiFetch(`/api/projects/${projectId}/data`)
    const data = await response.json().catch(() => null)
    const createdEpisodes = Array.isArray(data?.project?.episodes) ? data.project.episodes : []
    const firstEpisodeId = createdEpisodes[0]?.id

    setSmartSplitMode(false)
    if (!firstEpisodeId) return

    if (triggerGlobalAnalysis) {
      router.replace(`?stage=assets&episode=${firstEpisodeId}&globalAnalyze=1`, { scroll: false })
      return
    }
    router.replace(`?episode=${firstEpisodeId}`, { scroll: false })
  }, [projectId, queryClient, router])

  if (smartSplitMode) {
    return (
      <SmartImportWizard
        projectId={projectId}
        onManualCreate={() => setSmartSplitMode(false)}
        onImportComplete={handleSmartSplitComplete}
        initialRawContent={smartSplitText}
      />
    )
  }

  return (
    <ProjectInputStage
      novelText={novelText}
      episodeName={episodeName}
      onNovelTextChange={runtime.onNovelTextChange}
      isSubmittingTask={runtime.isSubmittingTTS || runtime.isStartingStoryToScript}
      isSwitchingStage={runtime.isTransitioning}
      videoRatio={runtime.videoRatio ?? undefined}
      artStyle={runtime.artStyle ?? undefined}
      visualStylePresetSource={runtime.visualStylePresetSource ?? undefined}
      visualStylePresetId={runtime.visualStylePresetId ?? undefined}
      directorStylePresetSource={runtime.directorStylePresetSource ?? undefined}
      directorStylePresetId={runtime.directorStylePresetId ?? undefined}
      onVideoRatioChange={runtime.onVideoRatioChange}
      onArtStyleChange={runtime.onArtStyleChange}
      onVisualStylePresetChange={runtime.onVisualStylePresetChange}
      onDirectorStylePresetRefChange={runtime.onDirectorStylePresetRefChange}
      onDirectorStylePresetChange={runtime.onDirectorStylePresetChange}
      onNext={runtime.onRunStoryToScript}
      onSmartSplit={handleSmartSplit}
    />
  )
}
