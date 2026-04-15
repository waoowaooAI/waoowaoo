'use client'

import type {
  SpeakerVoiceEntry as ProviderSpeakerVoiceEntry,
  SpeakerVoicePatch,
} from '@/lib/voice/provider-voice-binding'

export interface VoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  emotionPrompt: string | null
  emotionStrength: number | null
  audioUrl: string | null
  updatedAt: string | null
  lineTaskRunning: boolean
  matchedPanelId?: string | null
  matchedStoryboardId?: string | null
  matchedPanelIndex?: number | null
}

export type PendingVoiceTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled' | null

export interface PendingVoiceGenerationState {
  submittedUpdatedAt: string | null
  startedAt: string
  taskId: string | null
  taskStatus: PendingVoiceTaskStatus
  taskErrorMessage: string | null
}

export type PendingVoiceGenerationMap = Record<string, PendingVoiceGenerationState>

export interface Character {
  id: string
  name: string
  customVoiceUrl?: string | null
  voiceId?: string | null
}

export interface BindablePanelOption {
  id: string
  storyboardId: string
  panelIndex: number
  label: string
}

export interface EpisodeStoryboard {
  id: string
  clipId?: string | null
  panels?: Array<{
    id: string
    panelIndex: number
    srtSegment?: string | null
    description?: string | null
  }>
}

export interface EpisodeClip {
  id: string
}

export type SpeakerVoiceEntry = ProviderSpeakerVoiceEntry
export type InlineSpeakerVoiceBinding = SpeakerVoicePatch

export interface VoiceStageShellProps {
  projectId: string
  episodeId: string
  onBack?: () => void
  embedded?: boolean
  onVoiceLineClick?: (storyboardId: string, panelIndex: number) => void
  onVoiceLinesChanged?: () => void
  onOpenAssetLibraryForCharacter?: (characterId?: string | null) => void
}
