'use client'

import type { NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'
import { extractErrorMessage } from '@/lib/errors/extract'

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message === 'Failed to fetch')
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return extractErrorMessage(error, fallback)
}

export function getStoryboardPanels(storyboard: NovelPromotionStoryboard): NovelPromotionPanel[] {
  return Array.isArray(storyboard.panels) ? storyboard.panels : []
}

export interface InsertPanelMutationResult {
  async?: boolean
  taskId?: string
  panelNumber?: number
}
