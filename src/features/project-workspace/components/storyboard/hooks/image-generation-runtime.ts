import { ProjectPanel, ProjectStoryboard } from '@/types/project'

export interface StoryboardImageMutationResult {
  async?: boolean
  imageUrl?: string
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.message === 'Failed to fetch'
}

export function getStoryboardPanels(storyboard: ProjectStoryboard): ProjectPanel[] {
  return Array.isArray(storyboard.panels) ? storyboard.panels : []
}

export function updatePanelImageUrlInStoryboards(
  storyboards: ProjectStoryboard[],
  storyboardId: string,
  panelIndex: number,
  imageUrl: string,
): ProjectStoryboard[] {
  return storyboards.map((storyboard) => {
    if (storyboard.id !== storyboardId) return storyboard
    const panels = getStoryboardPanels(storyboard)
    const updatedPanels = panels.map((panel, index) =>
      index === panelIndex ? { ...panel, imageUrl } : panel,
    )
    return { ...storyboard, panels: updatedPanels }
  })
}

function createPanelMap(storyboards: ProjectStoryboard[]): Map<string, ProjectPanel> {
  const panelMap = new Map<string, ProjectPanel>()
  for (const storyboard of storyboards) {
    const panels = getStoryboardPanels(storyboard)
    for (const panel of panels) {
      panelMap.set(panel.id, panel)
    }
  }
  return panelMap
}

export function reconcileSubmittingPanelImageIds(
  previousIds: Set<string>,
  storyboards: ProjectStoryboard[],
): Set<string> {
  const panelMap = createPanelMap(storyboards)
  let changed = false
  const next = new Set(previousIds)

  for (const panelId of previousIds) {
    const panel = panelMap.get(panelId)
    if (!panel) {
      next.delete(panelId)
      changed = true
      continue
    }

    const isTaskRunning = Boolean((panel as { imageTaskRunning?: boolean }).imageTaskRunning)
    const hasError = Boolean((panel as { imageErrorMessage?: string | null }).imageErrorMessage)
    if (isTaskRunning || hasError) {
      next.delete(panelId)
      changed = true
    }
  }

  return changed ? next : previousIds
}

export function reconcileModifyingPanelIds(
  previousIds: Set<string>,
  storyboards: ProjectStoryboard[],
): Set<string> {
  const panelMap = createPanelMap(storyboards)
  let changed = false
  const next = new Set(previousIds)

  for (const panelId of previousIds) {
    const panel = panelMap.get(panelId)
    if (!panel) {
      next.delete(panelId)
      changed = true
      continue
    }

    const isTaskRunning = Boolean((panel as { imageTaskRunning?: boolean }).imageTaskRunning)
    const taskIntent = (panel as ProjectPanel & { imageTaskIntent?: string }).imageTaskIntent
    const hasError = Boolean((panel as { imageErrorMessage?: string | null }).imageErrorMessage)
    if ((isTaskRunning && taskIntent === 'modify') || hasError) {
      next.delete(panelId)
      changed = true
    }
  }

  return changed ? next : previousIds
}
