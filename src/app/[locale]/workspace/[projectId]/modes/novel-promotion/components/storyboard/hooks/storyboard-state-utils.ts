'use client'

import type { NovelPromotionClip, NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'

export function getStoryboardPanels(storyboard: NovelPromotionStoryboard): NovelPromotionPanel[] {
  return Array.isArray(storyboard.panels) ? storyboard.panels : []
}

export function sortStoryboardsByClipOrder(
  storyboards: NovelPromotionStoryboard[],
  clips: NovelPromotionClip[],
): NovelPromotionStoryboard[] {
  const clipIndexMap = new Map(clips.map((clip, index) => [clip.id, index]))
  return [...storyboards].sort((a, b) => {
    const indexA = clipIndexMap.get(a.clipId) ?? Number.MAX_VALUE
    const indexB = clipIndexMap.get(b.clipId) ?? Number.MAX_VALUE
    return indexA - indexB
  })
}

export function areStoryboardsEquivalent(
  previous: NovelPromotionStoryboard[],
  next: NovelPromotionStoryboard[],
): boolean {
  if (previous === next) return true
  if (previous.length !== next.length) return false
  return JSON.stringify(previous) === JSON.stringify(next)
}

export function buildStoryboardSyncSignature(
  storyboards: NovelPromotionStoryboard[],
  clips: NovelPromotionClip[],
): string {
  const clipSignature = clips.map((clip) => clip.id).join('|')
  const storyboardSignature = storyboards.map((storyboard) => {
    const panels = getStoryboardPanels(storyboard)
    const panelSignature = panels.map((panel) => {
      const id = typeof panel.id === 'string' ? panel.id : ''
      const panelRecord = panel as unknown as Record<string, unknown>
      const updatedAt = typeof panelRecord.updatedAt === 'string' ? panelRecord.updatedAt : ''
      const imageUrl = typeof panel.imageUrl === 'string' ? panel.imageUrl : ''
      const candidateImages = typeof panel.candidateImages === 'string' ? panel.candidateImages : ''
      const error = typeof panel.imageErrorMessage === 'string' ? panel.imageErrorMessage : ''
      const runningFlag = panel.imageTaskRunning ? '1' : '0'
      return `${id}:${updatedAt}:${imageUrl}:${candidateImages}:${error}:${runningFlag}`
    }).join(',')

    const storyboardRecord = storyboard as unknown as Record<string, unknown>
    const storyboardUpdatedAt = typeof storyboardRecord.updatedAt === 'string' ? storyboardRecord.updatedAt : ''
    return `${storyboard.id}:${storyboard.clipId}:${storyboardUpdatedAt}:${panels.length}:${panelSignature}`
  }).join('||')

  return `${clipSignature}:::${storyboardSignature}`
}

export function computeStoryboardStartIndex(
  sortedStoryboards: NovelPromotionStoryboard[],
): Record<string, number> {
  const storyboardStartIndex: Record<string, number> = {}
  let globalIndex = 0

  for (const storyboard of sortedStoryboards) {
    storyboardStartIndex[storyboard.id] = globalIndex
    globalIndex += getStoryboardPanels(storyboard).length || storyboard.panelCount || 0
  }

  return storyboardStartIndex
}

export function computeTotalPanels(storyboards: NovelPromotionStoryboard[]): number {
  return storyboards.reduce((sum, storyboard) => sum + (getStoryboardPanels(storyboard).length || storyboard.panelCount || 0), 0)
}

export function formatClipTitle(clip: NovelPromotionClip | null | undefined): string {
  if (!clip) return '-'
  if (clip.start !== undefined && clip.start !== null) {
    return `${clip.start}-${clip.end}`
  }
  if (clip.startText && clip.endText) {
    const startPreview = clip.startText.substring(0, 10)
    const endPreview = clip.endText.substring(0, 10)
    return `${startPreview}...~...${endPreview}`
  }
  return clip.id.slice(0, 8)
}
