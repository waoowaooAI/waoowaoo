'use client'

import type { NovelPromotionPanel } from '@/types/project'
import { extractErrorMessage } from '@/lib/errors/extract'

export interface PanelCandidateData {
  candidates: string[]
  selectedIndex: number
}

interface CandidateStateLike {
  candidates: string[]
  selectedIndex: number
  originalUrl?: string | null
  previousUrl?: string | null
}

interface PanelCandidateSystemLike {
  getCandidateState: (id: string) => CandidateStateLike | null | undefined
  clearCandidates: (id: string) => void
  initCandidates: (
    id: string,
    originalUrl: string | null,
    candidates: string[],
    previousUrl: string | null,
  ) => void
}

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function parseCandidateImages(candidateImagesStr: string): string[] | null {
  try {
    const candidates = JSON.parse(candidateImagesStr)
    if (!Array.isArray(candidates) || candidates.length === 0) return null
    const normalized = candidates.filter((candidate: string) => typeof candidate === 'string' && !!candidate)
    return normalized.length > 0 ? normalized : null
  } catch {
    return null
  }
}

function clearIfExists(system: PanelCandidateSystemLike, panelId: string) {
  const state = system.getCandidateState(panelId)
  if (state) {
    system.clearCandidates(panelId)
  }
}

export function ensurePanelCandidatesInitialized(
  panel: NovelPromotionPanel,
  candidateSystem: PanelCandidateSystemLike,
): boolean {
  const candidateImagesStr = panel.candidateImages
  if (!candidateImagesStr) {
    clearIfExists(candidateSystem, panel.id)
    return false
  }

  const candidates = parseCandidateImages(candidateImagesStr)
  if (!candidates) {
    clearIfExists(candidateSystem, panel.id)
    return false
  }

  const validCandidates = candidates.filter((candidate) => !candidate.startsWith('PENDING:'))
  if (validCandidates.length === 0) {
    clearIfExists(candidateSystem, panel.id)
    return true
  }

  const existingState = candidateSystem.getCandidateState(panel.id)
  const shouldRebuildState =
    !existingState ||
    !sameStringArray(existingState.candidates, validCandidates) ||
    (existingState.originalUrl || null) !== (panel.imageUrl || null) ||
    (existingState.previousUrl || null) !== (panel.previousImageUrl || null)

  if (shouldRebuildState) {
    candidateSystem.initCandidates(
      panel.id,
      panel.imageUrl || null,
      validCandidates,
      panel.previousImageUrl || null,
    )
  }
  return true
}

export function getPanelCandidatesFromRuntime(
  panel: NovelPromotionPanel,
  candidateSystem: PanelCandidateSystemLike,
): PanelCandidateData | null {
  const localState = candidateSystem.getCandidateState(panel.id)
  if (localState && localState.candidates.length > 0) {
    return {
      candidates: localState.candidates,
      selectedIndex: localState.selectedIndex,
    }
  }

  const candidateImagesStr = panel.candidateImages
  if (!candidateImagesStr) return null

  const candidates = parseCandidateImages(candidateImagesStr)
  if (!candidates) return null

  const validCandidates = candidates.filter((candidate) => !candidate.startsWith('PENDING:'))
  if (validCandidates.length === 0) {
    return {
      candidates,
      selectedIndex: 0,
    }
  }

  return {
    candidates: validCandidates,
    selectedIndex: 0,
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return extractErrorMessage(error, fallback)
}
