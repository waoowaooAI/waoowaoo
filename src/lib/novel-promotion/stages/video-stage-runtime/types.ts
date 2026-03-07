'use client'

import type {
  BatchVideoGenerationParams,
  Clip,
  FirstLastFrameParams,
  VideoGenerationOptions,
  Storyboard,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'

export interface VoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  audioUrl: string | null
  matchedStoryboardId: string | null
  matchedPanelIndex: number | null
}

export interface VideoModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

export interface EpisodeVideoUrlsResponse {
  videos?: Array<{ index: number; fileName: string; videoUrl: string }>
  projectName?: string
}

export interface VideoStageShellProps {
  projectId: string
  episodeId: string
  storyboards: Storyboard[]
  clips: Clip[]
  defaultVideoModel: string
  capabilityOverrides: CapabilitySelections
  videoRatio?: string
  userVideoModels?: VideoModelOption[]
  onGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: FirstLastFrameParams,
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => Promise<void>
  onGenerateAllVideos: (options?: BatchVideoGenerationParams) => Promise<void>
  onBack: () => void
  onUpdateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field?: 'videoPrompt' | 'firstLastFramePrompt',
  ) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  onOpenAssetLibraryForCharacter?: (characterId?: string | null) => void
  onEnterEditor?: () => void
}
