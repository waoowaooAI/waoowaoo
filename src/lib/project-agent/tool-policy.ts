import type { ProjectPhaseSnapshot } from './project-phase'
import type { ProjectAgentContext } from './types'
import type { ProjectAgentNodeId, ProjectAgentRouteDecision } from './router'
import type {
  OperationMode,
  OperationRiskLevel,
  OperationScope,
  OperationToolVisibility,
  ProjectAgentOperationDefinition,
  ProjectAgentOperationId,
  ProjectAgentOperationRegistry,
} from '@/lib/operations/types'
import type { ProjectAgentToolSelection, ToolRiskBudget } from './tool-selection'

export interface ProjectAgentToolSelectionResult {
  operationIds: ProjectAgentOperationId[]
  route: Pick<ProjectAgentRouteDecision, 'nodeId' | 'intent' | 'domains' | 'confidence' | 'reasonCodes'>
  totalCandidates: number
}

interface NodePolicy {
  desiredTags: string[]
  desiredScopes: OperationScope[]
  riskBudget: ToolRiskBudget
  /**
   * Whether guarded tools are eligible to be injected for this node.
   * Note: confirmed gate is still enforced at execution time.
   */
  allowGuardedTools: boolean
}

function readBudgetRank(budget: ToolRiskBudget): number {
  if (budget === 'low-only') return 0
  if (budget === 'allow-medium') return 1
  return 2
}

function mergeRiskBudget(nodeBudget: ToolRiskBudget, selectionBudget: ToolRiskBudget | undefined): ToolRiskBudget {
  if (!selectionBudget) return nodeBudget
  return readBudgetRank(selectionBudget) > readBudgetRank(nodeBudget) ? selectionBudget : nodeBudget
}

function readVisibilityScore(visibility: OperationToolVisibility): number {
  switch (visibility) {
    case 'core':
      return 40
    case 'scenario':
      return 25
    case 'extended':
      return 10
    case 'guarded':
      return -5
    case 'hidden':
      return -200
    default:
      return 0
  }
}

function readOperationMode(operation: ProjectAgentOperationDefinition): OperationMode {
  return operation.sideEffects?.mode ?? 'query'
}

function readOperationRisk(operation: ProjectAgentOperationDefinition): OperationRiskLevel {
  return operation.sideEffects?.risk ?? 'none'
}

function isRiskAllowed(risk: OperationRiskLevel, budget: ToolRiskBudget): boolean {
  if (risk === 'none' || risk === 'low') return true
  if (risk === 'medium') return budget !== 'low-only'
  return budget === 'allow-high-with-confirm'
}

function uniqueSorted(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
}

function readTags(operation: ProjectAgentOperationDefinition): string[] {
  const tags = operation.tool?.tags
  if (!Array.isArray(tags)) return []
  return tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim())
}

function readVisibility(operation: ProjectAgentOperationDefinition): OperationToolVisibility {
  const v = operation.tool?.defaultVisibility
  if (v === 'hidden' || v === 'core' || v === 'scenario' || v === 'extended' || v === 'guarded') return v
  return 'extended'
}

function requiresEpisode(operation: ProjectAgentOperationDefinition): boolean {
  if (operation.tool?.requiresEpisode !== undefined) return operation.tool.requiresEpisode
  return operation.scope === 'episode' || operation.scope === 'storyboard' || operation.scope === 'panel'
}

function shouldAllowInIntent(operation: ProjectAgentOperationDefinition, intent: ProjectAgentRouteDecision['intent']): boolean {
  const mode = readOperationMode(operation)
  if (intent === 'query') return mode === 'query'
  if (intent === 'plan') return mode === 'query' || mode === 'plan'
  return true
}

function toNodePolicy(nodeId: ProjectAgentNodeId): NodePolicy {
  switch (nodeId) {
    case 'workflow_plan':
      return { desiredTags: ['workflow'], desiredScopes: ['plan', 'command', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'workflow_run':
      return { desiredTags: ['run', 'workflow'], desiredScopes: ['command', 'task', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'run_manage':
      return { desiredTags: ['run'], desiredScopes: ['command', 'task', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'task_manage':
      return { desiredTags: ['task'], desiredScopes: ['task', 'command', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'storyboard_read':
      return { desiredTags: ['storyboard', 'panel', 'read'], desiredScopes: ['storyboard', 'panel', 'project'], riskBudget: 'low-only', allowGuardedTools: false }
    case 'storyboard_edit':
      return { desiredTags: ['storyboard', 'panel', 'edit'], desiredScopes: ['storyboard', 'panel', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'panel_media_generate':
      return { desiredTags: ['media', 'panel', 'storyboard'], desiredScopes: ['panel', 'storyboard', 'task', 'asset', 'project'], riskBudget: 'allow-high-with-confirm', allowGuardedTools: true }
    case 'project_assets_read':
      return { desiredTags: ['asset', 'read'], desiredScopes: ['asset', 'project'], riskBudget: 'low-only', allowGuardedTools: false }
    case 'project_assets_edit':
      return { desiredTags: ['asset', 'edit'], desiredScopes: ['asset', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'asset_hub_read':
      return { desiredTags: ['asset-hub', 'read'], desiredScopes: ['system', 'asset', 'project'], riskBudget: 'low-only', allowGuardedTools: false }
    case 'config_models':
      return { desiredTags: ['config'], desiredScopes: ['system', 'user', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'billing_costs':
      return { desiredTags: ['billing'], desiredScopes: ['project', 'system'], riskBudget: 'low-only', allowGuardedTools: false }
    case 'governance_recovery':
      return { desiredTags: ['governance'], desiredScopes: ['mutation-batch', 'project', 'task', 'command'], riskBudget: 'allow-high-with-confirm', allowGuardedTools: true }
    case 'downloads_exports':
      return { desiredTags: ['download'], desiredScopes: ['project', 'task', 'command'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'debug_tools':
      return { desiredTags: ['debug'], desiredScopes: ['system', 'project', 'task', 'command'], riskBudget: 'allow-high-with-confirm', allowGuardedTools: true }
    case 'project_overview':
      return { desiredTags: ['project', 'read'], desiredScopes: ['project', 'episode', 'command', 'task'], riskBudget: 'allow-medium', allowGuardedTools: false }
    case 'unknown':
    default:
      return { desiredTags: ['read'], desiredScopes: ['project', 'command', 'task'], riskBudget: 'allow-medium', allowGuardedTools: false }
  }
}

function scoreOperation(params: {
  operation: ProjectAgentOperationDefinition
  operationId: string
  nodePolicy: NodePolicy
  route: ProjectAgentRouteDecision
  context: ProjectAgentContext
  phase: ProjectPhaseSnapshot
}): number {
  const { operation } = params
  const tags = readTags(operation)
  const visibility = readVisibility(operation)
  const mode = readOperationMode(operation)
  const risk = readOperationRisk(operation)

  let score = 0
  score += operation.selection?.baseWeight ?? 0
  score += readVisibilityScore(visibility)

  if (params.nodePolicy.desiredScopes.includes(operation.scope)) score += 18

  let tagHits = 0
  for (const desired of params.nodePolicy.desiredTags) {
    if (tags.includes(desired)) tagHits += 1
  }
  score += Math.min(3, tagHits) * 12

  if (params.phase.availableActions.actMode.includes(params.operationId)) score += 28
  if (params.phase.availableActions.planMode.includes(params.operationId)) score += 20

  if (params.route.intent === mode) score += 10
  if (params.route.intent === 'plan' && mode === 'query') score += 6

  if (!isRiskAllowed(risk, params.nodePolicy.riskBudget)) score -= 500

  if (visibility === 'guarded' && !params.nodePolicy.allowGuardedTools) score -= 80

  if (requiresEpisode(operation) && !params.context.episodeId) score -= 500

  return score
}

export function selectProjectAgentTools(params: {
  operations: ProjectAgentOperationRegistry
  context: ProjectAgentContext
  phase: ProjectPhaseSnapshot
  route: ProjectAgentRouteDecision
  toolSelection: ProjectAgentToolSelection | null | undefined
  maxTools: number
}): ProjectAgentToolSelectionResult {
  if (!Number.isFinite(params.maxTools) || params.maxTools <= 0) {
    throw new Error('PROJECT_AGENT_INVALID_MAX_TOOLS')
  }

  const selection = params.toolSelection ?? null
  const nodePolicyBase = toNodePolicy(params.route.nodeId)
  const nodePolicy: NodePolicy = {
    ...nodePolicyBase,
    riskBudget: mergeRiskBudget(nodePolicyBase.riskBudget, selection?.profile?.riskBudget),
  }

  const enabled = new Set(selection?.overrides.enabledOperationIds ?? [])
  const disabled = new Set(selection?.overrides.disabledOperationIds ?? [])
  const pinned = selection?.overrides.pinnedOperationIds ?? []
  const pinnedSet = new Set(pinned)

  function ensureSelectableOperation(operationId: string) {
    const op = params.operations[operationId]
    if (!op) throw new Error('PROJECT_AGENT_TOOL_SELECTION_INVALID')
    const channels = op.channels ?? { tool: true, api: true }
    if (!channels.tool) throw new Error('PROJECT_AGENT_TOOL_SELECTION_INVALID')
    if (op.tool?.selectable !== true) throw new Error('PROJECT_AGENT_TOOL_SELECTION_INVALID')
  }

  for (const id of enabled) ensureSelectableOperation(id)
  for (const id of disabled) ensureSelectableOperation(id)
  for (const id of pinned) {
    ensureSelectableOperation(id)
  }

  const candidates: Array<{ operationId: string; score: number }> = []
  for (const [operationId, operation] of Object.entries(params.operations)) {
    const channels = operation.channels ?? { tool: true, api: true }
    if (!channels.tool) continue
    const visibility = readVisibility(operation)
    if (visibility === 'hidden') continue
    if (!shouldAllowInIntent(operation, params.route.intent)) continue
    if (requiresEpisode(operation) && !params.context.episodeId) continue
    const risk = readOperationRisk(operation)
    if (!isRiskAllowed(risk, nodePolicy.riskBudget)) continue

    if (disabled.has(operationId)) continue
    if (enabled.size > 0 && !enabled.has(operationId) && !pinnedSet.has(operationId)) {
      // When enabled list is specified, treat it as an allowlist (except pinned).
      continue
    }

    candidates.push({
      operationId,
      score: scoreOperation({
        operation,
        operationId,
        nodePolicy,
        route: params.route,
        context: params.context,
        phase: params.phase,
      }),
    })
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.operationId.localeCompare(b.operationId)
  })

  const maxTools = Math.trunc(params.maxTools)
  const pinnedResolved = pinned.filter((id) => !disabled.has(id))
  if (pinnedResolved.length > maxTools) {
    throw new Error('PROJECT_AGENT_TOOL_SELECTION_TOO_LARGE')
  }

  const selectedByScore = candidates
    .filter((c) => !pinnedSet.has(c.operationId))
    .slice(0, Math.max(0, maxTools - pinnedResolved.length))
    .map((c) => c.operationId)

  const selected = uniqueSorted([...pinnedResolved, ...selectedByScore])
  if (selected.length === 0) {
    throw new Error('PROJECT_AGENT_NO_TOOLS_AVAILABLE')
  }

  return {
    operationIds: selected,
    route: {
      nodeId: params.route.nodeId,
      intent: params.route.intent,
      domains: params.route.domains,
      confidence: params.route.confidence,
      reasonCodes: params.route.reasonCodes,
    },
    totalCandidates: candidates.length,
  }
}
