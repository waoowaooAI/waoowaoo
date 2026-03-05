'use client'

import ConfigStage from './ConfigStage'
import ScriptStage from './ScriptStage'
import StoryboardStage from './StoryboardStage'
import VideoStageRoute from './VideoStageRoute'
import VoiceStageRoute from './VoiceStageRoute'
import { StageErrorBoundary } from '@/components/ui/StageErrorBoundary'

interface WorkspaceStageContentProps {
  currentStage: string
}

const STAGE_NAMES: Record<string, string> = {
  config: 'Cấu hình',
  script: 'Kịch bản',
  assets: 'Tài nguyên',
  storyboard: 'Storyboard',
  videos: 'Video',
  voice: 'Giọng nói',
}

export default function WorkspaceStageContent({
  currentStage,
}: WorkspaceStageContentProps) {
  return (
    <div key={currentStage} className="animate-page-enter">
      <StageErrorBoundary stageName={STAGE_NAMES[currentStage] || currentStage}>
        {currentStage === 'config' && <ConfigStage />}

        {(currentStage === 'script' || currentStage === 'assets') && <ScriptStage />}

        {currentStage === 'storyboard' && <StoryboardStage />}

        {currentStage === 'videos' && <VideoStageRoute />}

        {currentStage === 'voice' && <VoiceStageRoute />}
      </StageErrorBoundary>
    </div>
  )
}
