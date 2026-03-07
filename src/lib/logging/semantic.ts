import { createScopedLogger } from './core'
import { registerProjectName } from './file-writer'

function maybeRegisterProject(projectId?: string, projectName?: string): void {
  if (projectId && projectName) {
    registerProjectName(projectId, projectName)
  }
}

type AnyRecord = Record<string, unknown>
type SemanticLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

const toOptionalString = (value: string | null | undefined): string | undefined => value ?? undefined

function toDetails(input: unknown): AnyRecord | unknown[] | null {
  if (input == null) return null
  if (Array.isArray(input)) return input
  if (typeof input === 'object') return input as AnyRecord
  return { value: input }
}

function resolveMessage(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function resolveDetails(messageOrDetails: unknown, details: unknown): unknown {
  if (typeof messageOrDetails === 'string') return details
  if (details == null) return messageOrDetails
  return {
    messageOrDetails,
    details,
  }
}

function createSemanticLogger(module: string) {
  return createScopedLogger({ module })
}

export function logInternal(
  module: string,
  level: SemanticLevel,
  message: string,
  details?: unknown,
  projectId?: string,
): void {
  createSemanticLogger(module).event({
    level,
    action: 'internal',
    message,
    projectId,
    details: toDetails(details),
  })
}

export function logUserAction(
  action: string,
  userId: string,
  username: string,
  message: unknown,
  details?: unknown,
  projectId?: string,
  projectName?: string,
): void {
  createSemanticLogger('user').event({
    level: 'INFO',
    audit: true,
    action,
    message: resolveMessage(message, action),
    userId,
    projectId,
    details: {
      ...(typeof details === 'object' && details != null ? (details as AnyRecord) : { details }),
      username,
      projectName,
    },
  })
}

export function logAIAnalysis(
  action: string,
  message: unknown,
  details?: unknown,
  userId?: string | null,
  username?: string | null,
  projectId?: string | null,
  projectName?: string | null,
): void
export function logAIAnalysis(
  userId: string | null | undefined,
  username: string | null | undefined,
  projectId: string | null | undefined,
  projectName: string | null | undefined,
  payload?: unknown,
): void
export function logAIAnalysis(
  ...args:
    | [string, unknown, unknown?, (string | null)?, (string | null)?, (string | null)?, (string | null)?]
    | [string | null | undefined, string | null | undefined, string | null | undefined, string | null | undefined, unknown?]
): void {
  let action = 'AI_ANALYSIS'
  let message: unknown = 'AI_ANALYSIS'
  let details: unknown = null
  let userId: string | undefined
  let username: string | undefined
  let projectId: string | undefined
  let projectName: string | undefined

  if (args.length === 5) {
    const [legacyUserId, legacyUsername, legacyProjectId, legacyProjectName, payload] = args
    const payloadRecord = typeof payload === 'object' && payload != null ? (payload as AnyRecord) : null
    userId = typeof legacyUserId === 'string' ? legacyUserId : undefined
    username = typeof legacyUsername === 'string' ? legacyUsername : undefined
    projectId = typeof legacyProjectId === 'string' ? legacyProjectId : undefined
    projectName = typeof legacyProjectName === 'string' ? legacyProjectName : undefined
    action = payloadRecord && typeof payloadRecord.action === 'string' ? payloadRecord.action : action
    message = payloadRecord && typeof payloadRecord.message === 'string' ? payloadRecord.message : action
    details = payload
  } else {
    const [nextAction, nextMessage, nextDetails, nextUserId, nextUsername, nextProjectId, nextProjectName] =
      args as [string, unknown, unknown?, (string | null)?, (string | null)?, (string | null)?, (string | null)?]
    action = nextAction
    message = nextMessage
    details = nextDetails ?? null
    userId = toOptionalString(nextUserId)
    username = toOptionalString(nextUsername)
    projectId = toOptionalString(nextProjectId)
    projectName = toOptionalString(nextProjectName)
  }

  maybeRegisterProject(projectId, projectName)
  createSemanticLogger('ai').event({
    level: 'INFO',
    audit: true,
    action,
    message: resolveMessage(message, action),
    userId,
    projectId,
    details: {
      ...(typeof resolveDetails(message, details) === 'object' && resolveDetails(message, details) != null
        ? (resolveDetails(message, details) as AnyRecord)
        : { details: resolveDetails(message, details) }),
      username,
      projectName,
    },
  })
}

export function logProjectAction(
  action: string,
  message: unknown,
  details?: unknown,
  userId?: string | null,
  username?: string | null,
  projectId?: string | null,
  projectName?: string | null,
): void
export function logProjectAction(
  action: string,
  userId: string | null | undefined,
  username: string | null | undefined,
  projectId: string | null | undefined,
  projectName: string | null | undefined,
  details?: unknown,
): void
export function logProjectAction(
  ...args:
    | [string, unknown, unknown?, (string | null)?, (string | null)?, (string | null)?, (string | null)?]
    | [string, string | null | undefined, string | null | undefined, string | null | undefined, string | null | undefined, unknown?]
): void {
  let action: string
  let message: unknown
  let details: unknown = null
  let userId: string | undefined
  let username: string | undefined
  let projectId: string | undefined
  let projectName: string | undefined

  if (args.length >= 6) {
    const [legacyAction, legacyUserId, legacyUsername, legacyProjectId, legacyProjectName, legacyDetails] =
      args as [string, string | null | undefined, string | null | undefined, string | null | undefined, string | null | undefined, unknown]
    action = legacyAction
    message = legacyAction
    details = legacyDetails
    userId = toOptionalString(legacyUserId)
    username = toOptionalString(legacyUsername)
    projectId = toOptionalString(legacyProjectId)
    projectName = toOptionalString(legacyProjectName)
  } else {
    const [nextAction, nextMessage, nextDetails, nextUserId, nextUsername, nextProjectId, nextProjectName] =
      args as [string, unknown, unknown?, (string | null)?, (string | null)?, (string | null)?, (string | null)?]
    action = nextAction
    message = nextMessage
    details = nextDetails ?? null
    userId = toOptionalString(nextUserId)
    username = toOptionalString(nextUsername)
    projectId = toOptionalString(nextProjectId)
    projectName = toOptionalString(nextProjectName)
  }

  maybeRegisterProject(projectId, projectName)
  createSemanticLogger('project').event({
    level: 'INFO',
    audit: true,
    action,
    message: resolveMessage(message, action),
    userId,
    projectId,
    details: {
      ...(typeof resolveDetails(message, details) === 'object' && resolveDetails(message, details) != null
        ? (resolveDetails(message, details) as AnyRecord)
        : { details: resolveDetails(message, details) }),
      username,
      projectName,
    },
  })
}

export function logAuthAction(
  action: string,
  message: unknown,
  details?: unknown,
  userId?: string,
  username?: string,
): void {
  createSemanticLogger('auth').event({
    level: 'INFO',
    audit: true,
    action,
    message: resolveMessage(message, action),
    userId,
    details: {
      ...(typeof details === 'object' && details != null ? (details as AnyRecord) : { details }),
      username,
    },
  })
}
