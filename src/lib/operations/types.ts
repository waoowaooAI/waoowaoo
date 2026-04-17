import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { NextRequest } from 'next/server'
import type { ZodTypeAny, infer as ZodInfer } from 'zod'
import type { ProjectAgentContext, WorkspaceAssistantPartType } from '@/lib/project-agent/types'

export interface ProjectAgentOperationContext {
  request: NextRequest
  userId: string
  projectId: string
  context: ProjectAgentContext
  writer: UIMessageStreamWriter<UIMessage>
}

export type OperationMode = 'query' | 'act' | 'plan'

export type OperationRiskLevel = 'none' | 'low' | 'medium' | 'high'

export interface OperationSideEffects {
  mode: OperationMode
  risk: OperationRiskLevel
  billable?: boolean
  requiresConfirmation?: boolean
  confirmationSummary?: string
}

export interface ProjectAgentOperationDefinition {
  description: string
  inputSchema: ZodTypeAny
  sideEffects?: OperationSideEffects
  execute: (context: ProjectAgentOperationContext, input: ZodInfer<ZodTypeAny>) => Promise<unknown>
}

export type ProjectAgentOperationRegistry = Record<string, ProjectAgentOperationDefinition>

export function writeOperationDataPart<T>(
  writer: UIMessageStreamWriter<UIMessage>,
  type: WorkspaceAssistantPartType,
  data: T,
) {
  writer.write({
    type,
    data,
  })
}
