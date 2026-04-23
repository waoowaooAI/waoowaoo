import type { OperationGroupPath, ProjectAgentOperationRegistry } from '@/lib/operations/types'
import type { OperationIntent } from '@/lib/operations/types'

const ALWAYS_ON_GROUP_PREFIXES: ReadonlyArray<OperationGroupPath> = [
  ['ui'],
  ['project', 'read'],
]

function groupKey(groupPath: OperationGroupPath): string {
  return groupPath.join('/')
}

function isGroupPrefix(groupPath: OperationGroupPath, prefix: OperationGroupPath): boolean {
  if (prefix.length === 0) return false
  if (groupPath.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (groupPath[i] !== prefix[i]) return false
  }
  return true
}

function assertAlwaysOnOperationIsLowRisk(params: {
  operationId: string
  groupPath: OperationGroupPath
  effects: {
    writes: boolean
    billable: boolean
    destructive: boolean
    externalSideEffects: boolean
  }
}) {
  const { effects } = params
  if (effects.writes || effects.billable || effects.destructive || effects.externalSideEffects) {
    throw new Error([
      'PROJECT_AGENT_ALWAYS_ON_OPERATION_SIDE_EFFECTS_NOT_ALLOWED',
      `operationId=${params.operationId}`,
      `groupPath=${params.groupPath.join('/')}`,
      `writes=${String(effects.writes)}`,
      `billable=${String(effects.billable)}`,
      `destructive=${String(effects.destructive)}`,
      `externalSideEffects=${String(effects.externalSideEffects)}`,
      'reason=always-on tools must be low-risk; otherwise they become unavoidably injected everywhere and increase accidental execution risk',
    ].join(':'))
  }
}

function normalizeRequestedGroups(requestedGroups: ReadonlyArray<OperationGroupPath>): OperationGroupPath[] {
  const deduped: OperationGroupPath[] = []
  const seen = new Set<string>()
  for (let groupIndex = 0; groupIndex < requestedGroups.length; groupIndex += 1) {
    const groupPath = requestedGroups[groupIndex]
    if (!Array.isArray(groupPath) || groupPath.length === 0) {
      throw new Error(`PROJECT_AGENT_INVALID_REQUESTED_GROUP_PATH:${String(groupIndex)}`)
    }

    const normalized: string[] = []
    for (let segmentIndex = 0; segmentIndex < groupPath.length; segmentIndex += 1) {
      const segment = groupPath[segmentIndex]
      if (typeof segment !== 'string') {
        throw new Error(`PROJECT_AGENT_INVALID_REQUESTED_GROUP_SEGMENT_TYPE:${String(groupIndex)}:${String(segmentIndex)}`)
      }
      const trimmed = segment.trim()
      if (!trimmed) {
        throw new Error(`PROJECT_AGENT_INVALID_REQUESTED_GROUP_SEGMENT_EMPTY:${String(groupIndex)}:${String(segmentIndex)}`)
      }
      if (trimmed !== segment) {
        throw new Error(`PROJECT_AGENT_INVALID_REQUESTED_GROUP_SEGMENT_WHITESPACE:${String(groupIndex)}:${String(segmentIndex)}`)
      }
      normalized.push(trimmed)
    }

    const key = groupKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(normalized)
  }
  return deduped
}

export function selectProjectAgentOperationsByGroups(params: {
  registry: ProjectAgentOperationRegistry
  requestedGroups: ReadonlyArray<OperationGroupPath>
  maxTools: number
  allowedIntents?: ReadonlyArray<OperationIntent>
}): {
  operationIds: string[]
  alwaysOnOperationIds: string[]
  requestedGroups: OperationGroupPath[]
} {
  const requestedGroups = normalizeRequestedGroups(params.requestedGroups)
  const allowedIntents = params.allowedIntents ? new Set<OperationIntent>(params.allowedIntents) : null

  const alwaysOnIds: string[] = []
  for (const [id, operation] of Object.entries(params.registry)) {
    if (!operation.channels.tool) continue
    if (!ALWAYS_ON_GROUP_PREFIXES.some((prefix) => isGroupPrefix(operation.groupPath, prefix))) continue
    assertAlwaysOnOperationIsLowRisk({
      operationId: id,
      groupPath: operation.groupPath,
      effects: {
        writes: operation.effects.writes,
        billable: operation.effects.billable,
        destructive: operation.effects.destructive,
        externalSideEffects: operation.effects.externalSideEffects,
      },
    })
    alwaysOnIds.push(id)
  }
  alwaysOnIds.sort()

  const selected = new Set<string>(alwaysOnIds)
  const ordered: string[] = [...alwaysOnIds]

  for (const groupPath of requestedGroups) {
    const groupIds: string[] = []
    for (const [id, operation] of Object.entries(params.registry)) {
      if (!operation.channels.tool) continue
      if (allowedIntents && !allowedIntents.has(operation.intent)) continue
      if (!isGroupPrefix(operation.groupPath, groupPath)) continue
      if (selected.has(id)) continue
      groupIds.push(id)
    }
    groupIds.sort()
    for (const id of groupIds) {
      selected.add(id)
      ordered.push(id)
    }
  }

  if (ordered.length > params.maxTools) {
    const requestedCount = ordered.length - alwaysOnIds.length
    if (requestedCount > params.maxTools) {
      throw new Error(`PROJECT_AGENT_SELECTED_TOOLS_EXCEED_LIMIT:${requestedCount}:${params.maxTools}`)
    }
  }

  return {
    operationIds: ordered,
    alwaysOnOperationIds: alwaysOnIds,
    requestedGroups,
  }
}
