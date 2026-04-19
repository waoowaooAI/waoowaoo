import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { NextRequest } from 'next/server'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'
import {
  writeOperationDataPart,
  type OperationSideEffects,
  type ProjectAgentToolError,
  type ProjectAgentToolErrorCode,
  type ProjectAgentToolResult,
} from '@/lib/operations/types'
import type { ConfirmationRequestPartData, ProjectAgentContext } from '@/lib/project-agent/types'

function shouldRequireAssistantConfirmation(sideEffects: OperationSideEffects | undefined): boolean {
  if (!sideEffects) return false
  if (sideEffects.requiresConfirmation !== undefined) return sideEffects.requiresConfirmation
  if (sideEffects.mode === 'query') return false
  if (sideEffects.billable) return true
  if (sideEffects.risk === 'high' || sideEffects.risk === 'medium') return true
  if (sideEffects.destructive || sideEffects.overwrite || sideEffects.bulk || sideEffects.longRunning) return true
  return false
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    return message || 'PROJECT_AGENT_OPERATION_FAILED'
  }
  if (typeof error === 'string' && error.trim()) return error.trim()
  try {
    return JSON.stringify(error)
  } catch {
    return 'PROJECT_AGENT_OPERATION_FAILED'
  }
}

function buildToolError(params: {
  code: ProjectAgentToolErrorCode
  message: string
  operationId: string
  details?: Record<string, unknown> | null
  issues?: unknown
}): ProjectAgentToolError {
  return {
    code: params.code,
    message: params.message,
    operationId: params.operationId,
    details: params.details ?? null,
    ...(params.issues !== undefined ? { issues: params.issues } : {}),
  }
}

export async function executeProjectAgentOperationFromTool(params: {
  request: NextRequest
  operationId: string
  projectId: string
  userId: string
  context: ProjectAgentContext
  source: string
  writer: UIMessageStreamWriter<UIMessage>
  input: unknown
}): Promise<ProjectAgentToolResult<unknown>> {
  const registry = createProjectAgentOperationRegistry()
  const operation = registry[params.operationId]
  if (!operation) {
    return {
      ok: false,
      error: buildToolError({
        code: 'OPERATION_NOT_FOUND',
        message: `operation not found: ${params.operationId}`,
        operationId: params.operationId,
      }),
    }
  }

  const parsed = operation.inputSchema.safeParse(params.input)
  if (!parsed.success) {
    return {
      ok: false,
      error: buildToolError({
        code: 'OPERATION_INPUT_INVALID',
        message: 'PROJECT_AGENT_INVALID_OPERATION_INPUT',
        operationId: params.operationId,
        issues: parsed.error.issues,
      }),
    }
  }

  const requiresConfirmation = shouldRequireAssistantConfirmation(operation.sideEffects)
  if (requiresConfirmation) {
    const confirmed = !!(
      parsed.data
      && typeof parsed.data === 'object'
      && (parsed.data as { confirmed?: unknown }).confirmed === true
    )
    if (!confirmed) {
      const budget = operation.sideEffects?.budgetKey || operation.sideEffects?.estimatedCostUnits
        ? {
            key: operation.sideEffects?.budgetKey,
            estimatedCostUnits: operation.sideEffects?.estimatedCostUnits,
          }
        : null
      writeOperationDataPart<ConfirmationRequestPartData>(params.writer, 'data-confirmation-request', {
        operationId: params.operationId,
        summary: operation.sideEffects?.confirmationSummary
          || `执行 ${params.operationId} 会产生写入或计费副作用。请在确认后重试，并在参数中带 confirmed=true。`,
        argsHint: {
          ...(parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data as Record<string, unknown> : {}),
          confirmed: true,
        },
        ...(budget ? { budget } : {}),
      })
      return {
        ok: false,
        confirmationRequired: true,
        error: buildToolError({
          code: 'CONFIRMATION_REQUIRED',
          message: operation.sideEffects?.confirmationSummary
            || `执行 ${params.operationId} 会产生写入或计费副作用。请在确认后重试，并在参数中带 confirmed=true。`,
          operationId: params.operationId,
          details: budget ? { budget } : null,
        }),
      }
    }
  }

  let result: unknown
  try {
    result = await operation.execute({
      request: params.request,
      userId: params.userId,
      projectId: params.projectId,
      context: params.context,
      source: params.source,
      writer: params.writer,
    }, parsed.data)
  } catch (error) {
    return {
      ok: false,
      error: buildToolError({
        code: 'OPERATION_EXECUTION_FAILED',
        message: toMessage(error),
        operationId: params.operationId,
        details: error instanceof Error && error.cause
          ? { cause: error.cause }
          : null,
      }),
    }
  }
  const outputParsed = operation.outputSchema.safeParse(result)
  if (!outputParsed.success) {
    return {
      ok: false,
      error: buildToolError({
        code: 'OPERATION_OUTPUT_INVALID',
        message: 'PROJECT_AGENT_OPERATION_OUTPUT_INVALID',
        operationId: params.operationId,
        issues: outputParsed.error.issues,
      }),
    }
  }
  return {
    ok: true,
    data: outputParsed.data,
  }
}
