import type { ProjectPhaseSnapshot } from './project-phase'
import type { ProjectAgentContext } from './types'
import type { ProjectAgentRouteDecision, ProjectAgentToolCategory } from './router'
import type {
  OperationMode,
  OperationRiskLevel,
  OperationScope,
  OperationToolVisibility,
  ProjectAgentOperationDefinition,
  ProjectAgentOperationId,
  ProjectAgentOperationRegistry,
} from '@/lib/operations/types'

export interface ProjectAgentToolSelectionResult {
  operationIds: ProjectAgentOperationId[]
  route: Pick<ProjectAgentRouteDecision, 'intent' | 'domains' | 'toolCategories' | 'confidence' | 'reasoning'>
  totalCandidates: number
}

type ToolRiskBudget = 'low-only' | 'allow-medium' | 'allow-high-with-confirm'

interface CategoryPolicy {
  desiredTags: string[]
  desiredScopes: OperationScope[]
  riskBudget: ToolRiskBudget
  allowGuardedTools: boolean
}

const CATEGORY_POLICIES: Record<ProjectAgentToolCategory, CategoryPolicy> = {
  'project-overview': { desiredTags: ['project', 'read'], desiredScopes: ['project', 'episode', 'command', 'task'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'workflow-plan': { desiredTags: ['workflow'], desiredScopes: ['plan', 'command', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'workflow-run': { desiredTags: ['workflow', 'run'], desiredScopes: ['command', 'task', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'run-manage': { desiredTags: ['run'], desiredScopes: ['command', 'task', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'task-manage': { desiredTags: ['task'], desiredScopes: ['task', 'command', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'storyboard-read': { desiredTags: ['storyboard', 'panel', 'read'], desiredScopes: ['storyboard', 'panel', 'project'], riskBudget: 'low-only', allowGuardedTools: false },
  'storyboard-edit': { desiredTags: ['storyboard', 'panel', 'edit'], desiredScopes: ['storyboard', 'panel', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'panel-media': { desiredTags: ['media', 'panel', 'storyboard'], desiredScopes: ['panel', 'storyboard', 'task', 'asset', 'project'], riskBudget: 'allow-high-with-confirm', allowGuardedTools: true },
  'asset-character': { desiredTags: ['asset', 'read', 'edit'], desiredScopes: ['asset', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'asset-location': { desiredTags: ['asset', 'read', 'edit'], desiredScopes: ['asset', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'asset-voice': { desiredTags: ['asset', 'read', 'edit'], desiredScopes: ['asset', 'project', 'episode'], riskBudget: 'allow-medium', allowGuardedTools: false },
  'asset-hub': { desiredTags: ['asset-hub', 'read'], desiredScopes: ['system', 'asset', 'project'], riskBudget: 'low-only', allowGuardedTools: false },
  config: { desiredTags: ['config'], desiredScopes: ['system', 'user', 'project'], riskBudget: 'allow-medium', allowGuardedTools: false },
  billing: { desiredTags: ['billing'], desiredScopes: ['project', 'system'], riskBudget: 'low-only', allowGuardedTools: false },
  governance: { desiredTags: ['governance'], desiredScopes: ['mutation-batch', 'project', 'task', 'command'], riskBudget: 'allow-high-with-confirm', allowGuardedTools: true },
  download: { desiredTags: ['download'], desiredScopes: ['project', 'task', 'command'], riskBudget: 'allow-medium', allowGuardedTools: false },
  debug: { desiredTags: ['debug'], desiredScopes: ['system', 'project', 'task', 'command'], riskBudget: 'allow-high-with-confirm', allowGuardedTools: true },
}

function readBudgetRank(budget: ToolRiskBudget): number {
  if (budget === 'low-only') return 0
  if (budget === 'allow-medium') return 1
  return 2
}

function mergeRiskBudget(left: ToolRiskBudget, right: ToolRiskBudget): ToolRiskBudget {
  return readBudgetRank(right) > readBudgetRank(left) ? right : left
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
  return tags
    .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim())
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

function mergeCategoryPolicies(categories: ProjectAgentToolCategory[]): CategoryPolicy {
  let desiredTags: string[] = []
  let desiredScopes: OperationScope[] = []
  let riskBudget: ToolRiskBudget = 'low-only'
  let allowGuardedTools = false

  for (const category of categories) {
    const policy = CATEGORY_POLICIES[category]
    if (!policy) continue
    desiredTags = [...desiredTags, ...policy.desiredTags]
    desiredScopes = [...desiredScopes, ...policy.desiredScopes]
    riskBudget = mergeRiskBudget(riskBudget, policy.riskBudget)
    allowGuardedTools = allowGuardedTools || policy.allowGuardedTools
  }

  return {
    desiredTags: uniqueSorted(desiredTags),
    desiredScopes: uniqueSorted(desiredScopes) as OperationScope[],
    riskBudget,
    allowGuardedTools,
  }
}

function scoreOperationForCategory(category: ProjectAgentToolCategory, operation: ProjectAgentOperationDefinition, operationId: string): number {
  const tags = readTags(operation)
  const haystack = `${operationId} ${operation.description}`.toLowerCase()

  switch (category) {
    case 'asset-character':
      return haystack.includes('character') ? 18 : tags.includes('asset') ? 4 : 0
    case 'asset-location':
      return haystack.includes('location') || haystack.includes('prop') ? 18 : tags.includes('asset') ? 4 : 0
    case 'asset-voice':
      return haystack.includes('voice') || haystack.includes('speaker') || haystack.includes('audio') ? 18 : 0
    case 'panel-media':
      return haystack.includes('image') || haystack.includes('video') || haystack.includes('panel') ? 18 : 0
    case 'storyboard-read':
    case 'storyboard-edit':
      return haystack.includes('storyboard') || haystack.includes('panel') || haystack.includes('clip') ? 14 : 0
    case 'workflow-plan':
    case 'workflow-run':
      return haystack.includes('workflow') || haystack.includes('plan') || haystack.includes('run') ? 14 : 0
    case 'run-manage':
      return haystack.includes('run') ? 14 : 0
    case 'task-manage':
      return haystack.includes('task') ? 14 : 0
    default:
      return 0
  }
}

function scoreOperation(params: {
  operation: ProjectAgentOperationDefinition
  operationId: string
  policy: CategoryPolicy
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

  if (params.policy.desiredScopes.includes(operation.scope)) score += 18

  let tagHits = 0
  for (const desired of params.policy.desiredTags) {
    if (tags.includes(desired)) tagHits += 1
  }
  score += Math.min(3, tagHits) * 12

  for (const category of params.route.toolCategories) {
    score += scoreOperationForCategory(category, operation, params.operationId)
  }

  if (params.phase.availableActions.actMode.includes(params.operationId)) score += 28
  if (params.phase.availableActions.planMode.includes(params.operationId)) score += 20

  if (params.route.intent === mode) score += 10
  if (params.route.intent === 'plan' && mode === 'query') score += 6

  if (!isRiskAllowed(risk, params.policy.riskBudget)) score -= 500
  if (visibility === 'guarded' && !params.policy.allowGuardedTools) score -= 80
  if (requiresEpisode(operation) && !params.context.episodeId) score -= 500

  return score
}

export function selectProjectAgentTools(params: {
  operations: ProjectAgentOperationRegistry
  context: ProjectAgentContext
  phase: ProjectPhaseSnapshot
  route: ProjectAgentRouteDecision
  maxTools: number
}): ProjectAgentToolSelectionResult {
  if (!Number.isFinite(params.maxTools) || params.maxTools <= 0) {
    throw new Error('PROJECT_AGENT_INVALID_MAX_TOOLS')
  }

  const policy = mergeCategoryPolicies(params.route.toolCategories)
  const candidates: Array<{ operationId: string; score: number }> = []

  for (const [operationId, operation] of Object.entries(params.operations)) {
    const channels = operation.channels ?? { tool: true, api: true }
    if (!channels.tool) continue
    const visibility = readVisibility(operation)
    if (visibility === 'hidden') continue
    if (!shouldAllowInIntent(operation, params.route.intent)) continue
    if (requiresEpisode(operation) && !params.context.episodeId) continue
    if (!isRiskAllowed(readOperationRisk(operation), policy.riskBudget)) continue

    candidates.push({
      operationId,
      score: scoreOperation({
        operation,
        operationId,
        policy,
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

  const selected = candidates
    .slice(0, Math.trunc(params.maxTools))
    .map((candidate) => candidate.operationId)

  if (selected.length === 0) {
    throw new Error('PROJECT_AGENT_NO_TOOLS_AVAILABLE')
  }

  return {
    operationIds: uniqueSorted(selected),
    route: {
      intent: params.route.intent,
      domains: params.route.domains,
      toolCategories: params.route.toolCategories,
      confidence: params.route.confidence,
      reasoning: params.route.reasoning,
    },
    totalCandidates: candidates.length,
  }
}
