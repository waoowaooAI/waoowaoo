import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { NextRequest } from 'next/server'
import type { ZodTypeAny, infer as ZodInfer } from 'zod'
import type { ProjectAgentContext, WorkspaceAssistantPartType } from '@/lib/project-agent/types'

export type ProjectAgentOperationId = string

export interface ProjectAgentOperationContext {
  request: NextRequest
  userId: string
  projectId: string
  context: ProjectAgentContext
  /**
   * Operation invocation source (entry semantics).
   * - assistant-panel: initiated by assistant tools in chat
   * - project-ui/api: initiated by explicit GUI/API actions
   */
  source: string
  writer?: UIMessageStreamWriter<UIMessage> | null
}

export type OperationMode = 'query' | 'act' | 'plan'

export type OperationRiskLevel = 'none' | 'low' | 'medium' | 'high'

export type OperationScope =
  | 'system'
  | 'user'
  | 'project'
  | 'episode'
  | 'storyboard'
  | 'panel'
  | 'asset'
  | 'task'
  | 'command'
  | 'plan'
  | 'mutation-batch'

export interface OperationChannels {
  tool: boolean
  api: boolean
}

export type OperationToolVisibility = 'hidden' | 'core' | 'scenario' | 'extended' | 'guarded'

export interface OperationToolMeta {
  /**
   * Whether this operation should be listed in the frontend tool configuration UI.
   * Note: selectable does NOT mean always injected into the model; it only means eligible to be selected.
   */
  selectable: boolean
  defaultVisibility: OperationToolVisibility
  /**
   * Group path for building tree UI, e.g. ['workflow', 'plan'].
   */
  groups: string[]
  /**
   * Tag list for routing and selection, e.g. ['storyboard', 'asset-hub'].
   */
  tags: string[]
  phases: string[]
  requiresEpisode: boolean
  allowInPlanMode: boolean
  allowInActMode: boolean
}

export type OperationCostHint = 'low' | 'medium' | 'high'

export interface OperationSelectionMeta {
  baseWeight: number
  costHint: OperationCostHint
}

export interface OperationSideEffects {
  mode: OperationMode
  risk: OperationRiskLevel
  billable?: boolean
  budgetKey?: string
  estimatedCostUnits?: number
  requiresConfirmation?: boolean
  confirmationSummary?: string
  overwrite?: boolean
  bulk?: boolean
  destructive?: boolean
  longRunning?: boolean
}

export type ProjectAgentToolErrorCode =
  | 'CONFIRMATION_REQUIRED'
  | 'OPERATION_EXECUTION_FAILED'
  | 'OPERATION_INPUT_INVALID'
  | 'OPERATION_NOT_FOUND'
  | 'OPERATION_OUTPUT_INVALID'

export interface ProjectAgentToolError {
  code: ProjectAgentToolErrorCode
  message: string
  operationId?: ProjectAgentOperationId
  details?: Record<string, unknown> | null
  issues?: unknown
}

export type ProjectAgentToolResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      confirmationRequired?: boolean
      error: ProjectAgentToolError
    }

export interface ProjectAgentOperationDefinition {
  id: ProjectAgentOperationId
  description: string
  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  sideEffects?: OperationSideEffects
  channels?: OperationChannels
  tool?: Partial<OperationToolMeta>
  selection?: Partial<OperationSelectionMeta>
  scope: OperationScope
  execute: (context: ProjectAgentOperationContext, input: ZodInfer<ZodTypeAny>) => Promise<unknown>
}

export type ProjectAgentOperationRegistry = Record<ProjectAgentOperationId, ProjectAgentOperationDefinition>

export function writeOperationDataPart<T>(
  writer: UIMessageStreamWriter<UIMessage> | null | undefined,
  type: WorkspaceAssistantPartType,
  data: T,
) {
  if (!writer) return
  writer.write({
    type,
    data,
  })
}
