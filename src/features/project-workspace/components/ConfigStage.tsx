'use client'

import { useCallback, useState } from 'react'
import { useParams } from 'next/navigation'
import ProjectInputStage from './ProjectInputStage'
import SmartImportWizard from './SmartImportWizard'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import type { SplitEpisode } from './smart-import/types'

/**
 * 配置阶段 — 整合 ProjectInputStage + 长文本智能分集
 * 
 * 当用户输入长文本（>1000字）并点击"开始创作"时，
 * 弹出引导卡片建议使用智能分集。
 * 选择"智能分集"后，直接进入 SmartImportWizard 的分析流程。
 */
export default function ConfigStage() {
  const runtime = useWorkspaceStageRuntime()
  const { episodeName, novelText } = useWorkspaceEpisodeStageData()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''

  // 智能分集模式
  const [smartSplitMode, setSmartSplitMode] = useState(false)
  const [smartSplitText, setSmartSplitText] = useState('')

  const handleSmartSplit = useCallback((text: string) => {
    setSmartSplitText(text)
    setSmartSplitMode(true)
  }, [])

  const handleSmartSplitComplete = useCallback((episodes: SplitEpisode[], triggerGlobalAnalysis?: boolean) => {
    // 分集完成后，刷新页面以加载新的剧集数据
    // 通过 window.location.reload 简单处理，因为分集会重新创建所有剧集
    void episodes
    void triggerGlobalAnalysis
    window.location.reload()
  }, [])

  // 如果已进入智能分集模式，显示 SmartImportWizard
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
