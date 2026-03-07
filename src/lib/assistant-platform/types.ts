import type { ToolSet } from 'ai'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

export type AssistantId = 'api-config-template' | 'tutorial'

export interface AssistantContext {
  providerId?: string
  locale?: string
}

export interface AssistantResolvedModel {
  providerId: string
  providerKey: string
  modelId: string
}

export interface AssistantRuntimeContext {
  userId: string
  assistantId: AssistantId
  context: AssistantContext
  analysisModelKey: string
  resolvedModel: AssistantResolvedModel
}

export interface AssistantToolResult {
  status: 'saved' | 'invalid' | 'error'
  message: string
  code?: string
  savedModelKey?: string
  savedModelKeys?: string[]
  issues?: Array<{
    code: string
    field: string
    message: string
  }>
  draftModel?: {
    modelId: string
    name: string
    type: 'image' | 'video'
    provider: string
    compatMediaTemplate: OpenAICompatMediaTemplate
  }
  draftModels?: Array<{
    modelId: string
    name: string
    type: 'image' | 'video'
    provider: string
    compatMediaTemplate: OpenAICompatMediaTemplate
  }>
}

export interface AssistantSkillDefinition {
  id: AssistantId
  systemPrompt: (ctx: AssistantRuntimeContext) => string
  tools?: (ctx: AssistantRuntimeContext) => ToolSet
  temperature?: number
  maxSteps?: number
}
