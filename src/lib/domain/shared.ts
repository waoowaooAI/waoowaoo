import type { WorkflowPackageId } from '@/lib/skill-system/types'

export type DomainMutationActor = 'assistant' | 'system' | 'user' | 'workflow'

export interface DomainMutationContext {
  actor: DomainMutationActor
  workflowId?: WorkflowPackageId | null
  runId?: string | null
  commandId?: string | null
  planId?: string | null
  taskId?: string | null
  idempotencyKey?: string | null
}

export class DomainValidationError extends Error {
  readonly code = 'DOMAIN_VALIDATION_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'DomainValidationError'
  }
}

export class DomainVersionConflictError extends Error {
  readonly code = 'DOMAIN_VERSION_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'DomainVersionConflictError'
  }
}

export function toVersionToken(value: Date | null | undefined): string | null {
  if (!(value instanceof Date)) return null
  return value.toISOString()
}

export function assertExpectedVersion(params: {
  entityLabel: string
  actualUpdatedAt: Date | null | undefined
  expectedVersion?: string | null
}) {
  if (!params.expectedVersion) return
  const actualVersion = toVersionToken(params.actualUpdatedAt)
  if (!actualVersion || actualVersion !== params.expectedVersion) {
    throw new DomainVersionConflictError(
      `${params.entityLabel} version mismatch: expected=${params.expectedVersion}, actual=${actualVersion || 'missing'}`,
    )
  }
}

export function assertNonEmptyText(value: string | null | undefined, label: string) {
  if (!value || !value.trim()) {
    throw new DomainValidationError(`${label} is required`)
  }
}

