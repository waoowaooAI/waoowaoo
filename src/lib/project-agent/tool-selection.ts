import { z } from 'zod'

export const TOOL_PROFILE_MODE = {
  EXPLORE: 'explore',
  EDIT: 'edit',
  GENERATE: 'generate',
  RECOVER: 'recover',
} as const

export type ToolProfileMode = (typeof TOOL_PROFILE_MODE)[keyof typeof TOOL_PROFILE_MODE]

export const TOOL_RISK_BUDGET = {
  LOW_ONLY: 'low-only',
  ALLOW_MEDIUM: 'allow-medium',
  ALLOW_HIGH_WITH_CONFIRM: 'allow-high-with-confirm',
} as const

export type ToolRiskBudget = (typeof TOOL_RISK_BUDGET)[keyof typeof TOOL_RISK_BUDGET]

export interface ProjectAgentToolSelectionProfile {
  mode: ToolProfileMode
  packs: string[]
  riskBudget: ToolRiskBudget
  optionalTags: string[]
}

export interface ProjectAgentToolSelectionOverrides {
  enabledOperationIds: string[]
  disabledOperationIds: string[]
  pinnedOperationIds: string[]
}

export interface ProjectAgentToolSelection {
  profile: ProjectAgentToolSelectionProfile
  overrides: ProjectAgentToolSelectionOverrides
}

export const ProjectAgentToolSelectionSchema = z.object({
  profile: z.object({
    mode: z.enum([TOOL_PROFILE_MODE.EXPLORE, TOOL_PROFILE_MODE.EDIT, TOOL_PROFILE_MODE.GENERATE, TOOL_PROFILE_MODE.RECOVER]).optional(),
    packs: z.array(z.string()).optional(),
    riskBudget: z.enum([TOOL_RISK_BUDGET.LOW_ONLY, TOOL_RISK_BUDGET.ALLOW_MEDIUM, TOOL_RISK_BUDGET.ALLOW_HIGH_WITH_CONFIRM]).optional(),
    optionalTags: z.array(z.string()).optional(),
  }).optional(),
  overrides: z.object({
    enabledOperationIds: z.array(z.string()).optional(),
    disabledOperationIds: z.array(z.string()).optional(),
    pinnedOperationIds: z.array(z.string()).optional(),
  }).optional(),
})

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const value of values) {
    const trimmed = normalizeString(value)
    if (!trimmed) continue
    out.push(trimmed)
  }
  return out
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function normalizeProjectAgentToolSelection(raw: unknown): ProjectAgentToolSelection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const parsed = ProjectAgentToolSelectionSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('PROJECT_AGENT_TOOL_SELECTION_INVALID')
  }

  const profileRaw = parsed.data.profile ?? {}
  const overridesRaw = parsed.data.overrides ?? {}

  const mode = profileRaw.mode ?? TOOL_PROFILE_MODE.EXPLORE
  const riskBudget = profileRaw.riskBudget ?? TOOL_RISK_BUDGET.ALLOW_MEDIUM

  const packs = unique(normalizeStringList(profileRaw.packs))
  const optionalTags = unique(normalizeStringList(profileRaw.optionalTags))

  const enabledOperationIds = unique(normalizeStringList(overridesRaw.enabledOperationIds))
  const disabledOperationIds = unique(normalizeStringList(overridesRaw.disabledOperationIds))
  const pinnedOperationIds = unique(normalizeStringList(overridesRaw.pinnedOperationIds))

  if (pinnedOperationIds.length > 12) {
    throw new Error('PROJECT_AGENT_TOOL_SELECTION_TOO_LARGE')
  }

  return {
    profile: {
      mode,
      packs,
      riskBudget,
      optionalTags,
    },
    overrides: {
      enabledOperationIds,
      disabledOperationIds,
      pinnedOperationIds,
    },
  }
}

