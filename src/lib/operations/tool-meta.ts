import type {
  OperationChannels,
  OperationCostHint,
  OperationMode,
  OperationRiskLevel,
  OperationScope,
  OperationSelectionMeta,
  OperationSideEffects,
  OperationToolMeta,
  OperationToolVisibility,
  ProjectAgentOperationDefinition,
  ProjectAgentOperationRegistry,
} from './types'

export interface OperationToolMetaDefaults {
  channels?: Partial<OperationChannels>
  tool?: Partial<OperationToolMeta>
  selection?: Partial<OperationSelectionMeta>
}

function normalizeStringList(values: string[] | undefined): string[] {
  if (!values) return []
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    out.push(trimmed)
  }
  return out
}

function inferRisk(sideEffects: OperationSideEffects | undefined): OperationRiskLevel {
  return sideEffects?.risk ?? 'none'
}

function inferMode(sideEffects: OperationSideEffects | undefined): OperationMode {
  return sideEffects?.mode ?? 'query'
}

function inferDefaultVisibility(params: {
  sideEffects: OperationSideEffects | undefined
  scope: OperationScope
}): OperationToolVisibility {
  const risk = inferRisk(params.sideEffects)
  const mode = inferMode(params.sideEffects)
  if (risk === 'high' || risk === 'medium') return 'guarded'
  if (mode === 'plan') return 'scenario'
  if (params.scope === 'system' || params.scope === 'user') return 'extended'
  if (mode === 'act') return 'extended'
  return 'core'
}

function inferCostHint(sideEffects: OperationSideEffects | undefined): OperationCostHint {
  if (sideEffects?.billable) return 'high'
  const risk = inferRisk(sideEffects)
  if (risk === 'high') return 'high'
  if (risk === 'medium') return 'medium'
  return 'low'
}

function inferRequiresEpisode(scope: OperationScope): boolean {
  return scope === 'episode' || scope === 'storyboard' || scope === 'panel'
}

function buildMergedChannels(
  operation: ProjectAgentOperationDefinition,
  defaults: OperationToolMetaDefaults,
): OperationChannels {
  const fromOp = operation.channels ?? { tool: true, api: true }
  const override = defaults.channels ?? {}
  return {
    tool: override.tool ?? fromOp.tool,
    api: override.api ?? fromOp.api,
  }
}

function buildMergedToolMeta(
  operation: ProjectAgentOperationDefinition,
  defaults: OperationToolMetaDefaults,
): OperationToolMeta {
  const fromOp = operation.tool ?? {}
  const fromDefaults = defaults.tool ?? {}
  const visibility = fromOp.defaultVisibility ?? fromDefaults.defaultVisibility ?? inferDefaultVisibility({
    sideEffects: operation.sideEffects,
    scope: operation.scope,
  })
  return {
    selectable: fromOp.selectable ?? fromDefaults.selectable ?? visibility !== 'hidden',
    defaultVisibility: visibility,
    groups: normalizeStringList(fromOp.groups ?? fromDefaults.groups),
    tags: normalizeStringList(fromOp.tags ?? fromDefaults.tags),
    phases: normalizeStringList(fromOp.phases ?? fromDefaults.phases),
    requiresEpisode: fromOp.requiresEpisode ?? fromDefaults.requiresEpisode ?? inferRequiresEpisode(operation.scope),
    allowInPlanMode: fromOp.allowInPlanMode ?? fromDefaults.allowInPlanMode ?? true,
    allowInActMode: fromOp.allowInActMode ?? fromDefaults.allowInActMode ?? true,
  }
}

function buildMergedSelectionMeta(
  operation: ProjectAgentOperationDefinition,
  defaults: OperationToolMetaDefaults,
): OperationSelectionMeta {
  const fromOp = operation.selection ?? {}
  const fromDefaults = defaults.selection ?? {}
  return {
    baseWeight: fromOp.baseWeight ?? fromDefaults.baseWeight ?? 0,
    costHint: fromOp.costHint ?? fromDefaults.costHint ?? inferCostHint(operation.sideEffects),
  }
}

export function decorateProjectAgentOperationRegistryWithToolMeta(
  registry: ProjectAgentOperationRegistry,
  defaults: OperationToolMetaDefaults,
): ProjectAgentOperationRegistry {
  const out: ProjectAgentOperationRegistry = {}
  for (const [operationId, operation] of Object.entries(registry)) {
    out[operationId] = {
      ...operation,
      channels: buildMergedChannels(operation, defaults),
      tool: buildMergedToolMeta(operation, defaults),
      selection: buildMergedSelectionMeta(operation, defaults),
    }
  }
  return out
}

