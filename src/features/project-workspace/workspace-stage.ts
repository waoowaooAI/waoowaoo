export const WORKSPACE_STAGES = [
  'config',
  'canvas',
  'script',
  'assets',
  'text-storyboard',
  'storyboard',
  'videos',
  'voice',
  'editor',
] as const

export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number]

export function isWorkspaceStage(value: string | null): value is WorkspaceStage {
  if (!value) return false
  return WORKSPACE_STAGES.some((stage) => stage === value)
}

export function resolveWorkspaceStage(value: string | null): WorkspaceStage {
  if (!isWorkspaceStage(value)) return 'canvas'
  if (value === 'editor') return 'videos'
  return value
}
