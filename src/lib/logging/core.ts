import { LOG_CONFIG, shouldLogLevel } from './config'
import { getLogContext } from './context'
import { redactValue } from './redact'
import type { ErrorFields, LogContext, LogEvent, LogLevel, SemanticContext } from './types'

type FileWriterModule = typeof import('./file-writer')

let fileWriterModulePromise: Promise<FileWriterModule> | null = null

const SUPPRESSED_LOG_ACTIONS = new Set<string>(['worker.progress.stream'])

function shouldSuppressLogEvent(event: Pick<LogEvent, 'action'>): boolean {
  if (!event.action) return false
  return SUPPRESSED_LOG_ACTIONS.has(event.action)
}

function writeProjectLogLine(line: string, projectId: string | undefined, moduleName: string | undefined): void {
  if (!projectId) return
  if (typeof window !== 'undefined') return
  if (!fileWriterModulePromise) {
    fileWriterModulePromise = import('./file-writer')
  }
  void fileWriterModulePromise
    .then((mod) => mod.writeLogToProjectFile(line, projectId, moduleName))
    .catch(() => undefined)
}

function serializeError(error: unknown): ErrorFields | undefined {
  if (!error) return undefined
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown }).code
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof maybeCode === 'string' ? maybeCode : undefined,
    }
  }
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>
    return {
      name: typeof obj.name === 'string' ? obj.name : 'Error',
      message: typeof obj.message === 'string' ? obj.message : JSON.stringify(obj),
      code: typeof obj.code === 'string' ? obj.code : undefined,
    }
  }
  return { message: String(error) }
}

function normalizeDetails(args: unknown[]): Record<string, unknown> | unknown[] | null {
  if (args.length === 0) return null
  if (args.length === 1) {
    return (args[0] as Record<string, unknown> | unknown[] | null | undefined) ?? null
  }
  return args
}

function parseLogArgs(args: unknown[]): { message: string; details: Record<string, unknown> | unknown[] | null; error?: ErrorFields } {
  if (args.length === 0) {
    return { message: '', details: null }
  }

  const [first, ...rest] = args
  const maybeError = [...args].find((item) => item instanceof Error)
  const error = maybeError ? serializeError(maybeError) : undefined

  if (typeof first === 'string') {
    return {
      message: first,
      details: normalizeDetails(rest),
      error,
    }
  }

  return {
    message: 'log',
    details: normalizeDetails(args),
    error,
  }
}

function nowChinaISOString(): string {
  const now = new Date()
  // UTC+8 偏移量（毫秒）
  const offsetMs = 8 * 60 * 60 * 1000
  const cstTime = new Date(now.getTime() + offsetMs)
  // toISOString() 返回 UTC 格式，替换 Z 为 +08:00 即为北京时间
  return cstTime.toISOString().replace('Z', '+08:00')
}

function write(level: LogLevel, event: Omit<LogEvent, 'ts' | 'level' | 'service'>): void {
  const shouldEmitByLevel = shouldLogLevel(level)
  const shouldEmitAudit = Boolean(event.audit) && LOG_CONFIG.auditEnabled
  if (!shouldEmitByLevel && !shouldEmitAudit) return

  const context = getLogContext()
  const merged: LogEvent = {
    ts: nowChinaISOString(),
    level,
    service: LOG_CONFIG.service,
    audit: event.audit ?? false,
    module: event.module || context.module,
    action: event.action || context.action,
    message: event.message,
    requestId: event.requestId || context.requestId,
    taskId: event.taskId || context.taskId,
    projectId: event.projectId || context.projectId,
    userId: event.userId || context.userId,
    errorCode: event.errorCode,
    retryable: event.retryable,
    durationMs: event.durationMs,
    provider: event.provider || context.provider,
    details: event.details ?? null,
    error: event.error,
  }

  const safeEvent = redactValue(merged, [...LOG_CONFIG.redactKeys]) as LogEvent
  if (shouldSuppressLogEvent(safeEvent)) return
  const line = JSON.stringify(safeEvent)
  if (level === 'ERROR') {
    console.error(line)
  } else {
    console.log(line)
  }
  writeProjectLogLine(line, safeEvent.projectId || undefined, safeEvent.module || undefined)
}

export function logEvent(event: Partial<LogEvent> & { level: LogLevel; message: string }): void {
  const { level, ...rest } = event
  write(level, {
    audit: rest.audit ?? false,
    message: rest.message,
    module: rest.module,
    action: rest.action,
    requestId: rest.requestId,
    taskId: rest.taskId,
    projectId: rest.projectId,
    userId: rest.userId,
    errorCode: rest.errorCode,
    retryable: rest.retryable,
    durationMs: rest.durationMs,
    provider: rest.provider,
    details: rest.details ?? null,
    error: rest.error,
  })
}

function logWithLevel(level: LogLevel, context: Partial<LogContext> | undefined, args: unknown[]): void {
  const { message, details, error } = parseLogArgs(args)
  write(level, {
    audit: false,
    message,
    module: context?.module,
    action: context?.action,
    requestId: context?.requestId,
    taskId: context?.taskId,
    projectId: context?.projectId,
    userId: context?.userId,
    provider: context?.provider,
    details,
    error,
  })
}

type ScopedLogInput = {
  audit?: boolean
  message: string
  action?: string
  module?: string
  requestId?: string
  taskId?: string
  projectId?: string
  userId?: string
  provider?: string
  errorCode?: string
  retryable?: boolean
  durationMs?: number
  details?: Record<string, unknown> | unknown[] | null
  error?: ErrorFields
}

type ScopedLogFn = (...args: unknown[]) => void

function isScopedLogInput(value: unknown): value is ScopedLogInput {
  return Boolean(value) && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string'
}

function logScoped(level: LogLevel, baseContext: Partial<SemanticContext>, args: unknown[]): void {
  if (args.length === 1 && isScopedLogInput(args[0])) {
    const input = args[0]
    write(level, {
      audit: input.audit ?? false,
      message: input.message,
      module: input.module || baseContext.module,
      action: input.action || baseContext.action,
      requestId: input.requestId || baseContext.requestId,
      taskId: input.taskId || baseContext.taskId,
      projectId: input.projectId || baseContext.projectId,
      userId: input.userId || baseContext.userId,
      provider: input.provider || baseContext.provider,
      errorCode: input.errorCode || baseContext.errorCode,
      retryable: input.retryable ?? baseContext.retryable,
      durationMs: input.durationMs ?? baseContext.durationMs,
      details: input.details ?? null,
      error: input.error,
    })
    return
  }

  const { message, details, error } = parseLogArgs(args)
  write(level, {
    audit: false,
    message,
    module: baseContext.module,
    action: baseContext.action,
    requestId: baseContext.requestId,
    taskId: baseContext.taskId,
    projectId: baseContext.projectId,
    userId: baseContext.userId,
    provider: baseContext.provider,
    errorCode: baseContext.errorCode,
    retryable: baseContext.retryable,
    durationMs: baseContext.durationMs,
    details,
    error,
  })
}

export function logDebug(...args: unknown[]): void {
  logWithLevel('DEBUG', undefined, args)
}

export function logInfo(...args: unknown[]): void {
  logWithLevel('INFO', undefined, args)
}

export function logWarn(...args: unknown[]): void {
  logWithLevel('WARN', undefined, args)
}

export function logError(...args: unknown[]): void {
  logWithLevel('ERROR', undefined, args)
}

export function logDebugCtx(context: Partial<LogContext>, ...args: unknown[]): void {
  logWithLevel('DEBUG', context, args)
}

export function logInfoCtx(context: Partial<LogContext>, ...args: unknown[]): void {
  logWithLevel('INFO', context, args)
}

export function logWarnCtx(context: Partial<LogContext>, ...args: unknown[]): void {
  logWithLevel('WARN', context, args)
}

export function logErrorCtx(context: Partial<LogContext>, ...args: unknown[]): void {
  logWithLevel('ERROR', context, args)
}

export type ScopedLogger = {
  debug: ScopedLogFn
  info: ScopedLogFn
  warn: ScopedLogFn
  error: ScopedLogFn
  event: (event: ScopedLogInput & { level: LogLevel }) => void
  child: (context: Partial<SemanticContext>) => ScopedLogger
}

export function createScopedLogger(baseContext: Partial<SemanticContext>): ScopedLogger {
  return {
    debug: (...args: unknown[]) => logScoped('DEBUG', baseContext, args),
    info: (...args: unknown[]) => logScoped('INFO', baseContext, args),
    warn: (...args: unknown[]) => logScoped('WARN', baseContext, args),
    error: (...args: unknown[]) => logScoped('ERROR', baseContext, args),
    event: (event) => {
      write(event.level, {
        audit: event.audit ?? false,
        message: event.message,
        module: event.module || baseContext.module,
        action: event.action || baseContext.action,
        requestId: event.requestId || baseContext.requestId,
        taskId: event.taskId || baseContext.taskId,
        projectId: event.projectId || baseContext.projectId,
        userId: event.userId || baseContext.userId,
        provider: event.provider || baseContext.provider,
        errorCode: event.errorCode || baseContext.errorCode,
        retryable: event.retryable ?? baseContext.retryable,
        durationMs: event.durationMs ?? baseContext.durationMs,
        details: event.details ?? null,
        error: event.error,
      })
    },
    child: (context: Partial<SemanticContext>) => createScopedLogger({ ...baseContext, ...context }),
  }
}
