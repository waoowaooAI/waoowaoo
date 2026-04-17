import type { ProjectPolicyOverrideInput, ProjectPolicySnapshot } from './types'

export const DEFAULT_PROJECT_POLICY_VALUES = {
  videoRatio: '9:16',
  artStyle: 'american-comic',
} as const

export function resolveProjectContextPolicy(params: {
  projectId: string
  episodeId?: string | null
  projectPolicy?: Partial<ProjectPolicySnapshot> | null
  commandPolicy?: ProjectPolicyOverrideInput | null
}): ProjectPolicySnapshot {
  const projectPolicy = params.projectPolicy || null
  const commandPolicy = params.commandPolicy || null

  return {
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    videoRatio:
      commandPolicy?.videoRatio
      || projectPolicy?.videoRatio
      || DEFAULT_PROJECT_POLICY_VALUES.videoRatio,
    artStyle:
      commandPolicy?.artStyle
      || projectPolicy?.artStyle
      || DEFAULT_PROJECT_POLICY_VALUES.artStyle,
    analysisModel:
      commandPolicy?.analysisModel !== undefined
        ? commandPolicy.analysisModel
        : (projectPolicy?.analysisModel ?? null),
    overrides: {
      ...(projectPolicy?.overrides || {}),
      ...(commandPolicy?.overrides || {}),
    },
  }
}
