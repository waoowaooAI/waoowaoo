export const VALID_WORKSPACE_STAGES = [
  'config',
  'script',
  'assets',
  'text-storyboard',
  'storyboard',
  'videos',
  'panels',
  'voice',
  'editor',
] as const

export type WorkspaceStage = typeof VALID_WORKSPACE_STAGES[number]

export function normalizeWorkspaceStage(urlStage: string | null | undefined): WorkspaceStage {
  if (!urlStage || !VALID_WORKSPACE_STAGES.includes(urlStage as WorkspaceStage)) {
    return 'config'
  }

  // Keep backward compatibility: editor shell still routes to videos runtime.
  if (urlStage === 'editor') return 'videos'

  // IMPORTANT: keep `panels` as first-class alias for manga lane.
  // Do not collapse into `videos` here, otherwise UI loses lane identity.
  return urlStage as WorkspaceStage
}
