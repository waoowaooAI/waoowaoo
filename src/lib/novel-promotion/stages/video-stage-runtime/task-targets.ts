'use client'

import type { Storyboard } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import type { VoiceLine } from './types'

interface VideoTaskTarget {
  key: string
  targetType: string
  targetId: string
  types: string[]
  resource: 'video'
  hasOutput: boolean
}

interface VoiceTaskTarget {
  key: string
  targetType: string
  targetId: string
  types: string[]
  resource: 'audio'
  hasOutput: boolean
}

export function buildPanelVideoTargets(storyboards: Storyboard[]): VideoTaskTarget[] {
  const targets: VideoTaskTarget[] = []
  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels || []) {
      if (!panel.id) continue
      targets.push({
        key: `panel-video:${panel.id}`,
        targetType: 'NovelPromotionPanel',
        targetId: panel.id,
        types: ['video_panel'],
        resource: 'video',
        hasOutput: !!panel.videoUrl,
      })
    }
  }
  return targets
}

export function buildPanelLipTargets(storyboards: Storyboard[]): VideoTaskTarget[] {
  const targets: VideoTaskTarget[] = []
  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels || []) {
      if (!panel.id) continue
      targets.push({
        key: `panel-lip:${panel.id}`,
        targetType: 'NovelPromotionPanel',
        targetId: panel.id,
        types: ['lip_sync'],
        resource: 'video',
        hasOutput: !!panel.lipSyncVideoUrl,
      })
    }
  }
  return targets
}

export function buildVoiceLineTargets(voiceLines: VoiceLine[]): VoiceTaskTarget[] {
  return voiceLines
    .filter((line) => line.matchedStoryboardId && line.matchedPanelIndex !== null)
    .map((line) => ({
      key: `line:${line.id}`,
      targetType: 'NovelPromotionVoiceLine',
      targetId: line.id,
      types: ['voice_line'],
      resource: 'audio' as const,
      hasOutput: !!line.audioUrl,
    }))
}
