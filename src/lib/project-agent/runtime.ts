import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  tool,
  type UIMessage,
} from 'ai'
import type { NextRequest } from 'next/server'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'
import { getUserModelConfig } from '@/lib/config-service'
import { executeProjectAgentOperationFromTool } from '@/lib/adapters/tools/execute-project-agent-operation'
import { writeOperationDataPart } from '@/lib/operations/types'
import { getRequestId } from '@/lib/api-errors'
import { createScopedLogger } from '@/lib/logging/core'
import type { ProjectAgentContext } from './types'
import { resolveProjectPhase } from './project-phase'
import { createProjectAgentStopController } from './stop-conditions'
import type { ProjectAgentStopPartData } from './types'
import { routeProjectAgentRequest } from './router'
import { selectProjectAgentTools } from './tool-policy'
import { buildProjectAgentSystemPrompt } from './copy'
import { normalizeProjectAgentLocale } from './locale'
import { compressMessages } from './message-compression'
import { resolveProjectAgentLanguageModel } from './model'
import type { ProjectAgentInteractionMode } from './types'
import { resolveProjectAgentExecutionMode } from './execution-mode'

const projectAgentLogger = createScopedLogger({
  module: 'project-agent.runtime',
})

function buildMessagePreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized
}

function normalizeInteractionMode(value: unknown): ProjectAgentInteractionMode | undefined {
  if (value !== 'auto' && value !== 'plan' && value !== 'fast') return undefined
  return value
}

function normalizeProjectAgentContext(raw: unknown): ProjectAgentContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  const locale = typeof record.locale === 'string' ? record.locale.trim() : ''
  const episodeId = typeof record.episodeId === 'string' ? record.episodeId.trim() : ''
  const currentStage = typeof record.currentStage === 'string' ? record.currentStage.trim() : ''
  const interactionMode = normalizeInteractionMode(record.interactionMode)
  return {
    ...(locale ? { locale } : {}),
    ...(episodeId ? { episodeId } : {}),
    ...(currentStage ? { currentStage } : {}),
    ...(interactionMode ? { interactionMode } : {}),
  }
}

async function toModelMessages(messages: UIMessage[]) {
  const withoutIds = messages.map((message) => {
    const rest: Omit<UIMessage, 'id'> = {
      role: message.role,
      parts: message.parts,
      ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
    }
    return rest
  })
  return await convertToModelMessages(withoutIds)
}

export async function createProjectAgentChatResponse(input: {
  request: NextRequest
  userId: string
  projectId: string
  context: unknown
  messages: unknown
}): Promise<Response> {
  const validation = await safeValidateUIMessages({ messages: input.messages })
  if (!validation.success) {
    throw new Error('PROJECT_AGENT_INVALID_MESSAGES')
  }
  const normalizedMessages = validation.data
  if (normalizedMessages.length === 0) {
    throw new Error('PROJECT_AGENT_EMPTY_MESSAGES')
  }

  const userConfig = await getUserModelConfig(input.userId)
  const analysisModelKey = userConfig.analysisModel?.trim() || ''
  if (!analysisModelKey) {
    throw new Error('PROJECT_AGENT_MODEL_NOT_CONFIGURED')
  }

  const contextBase = normalizeProjectAgentContext(input.context)
  const context: ProjectAgentContext = {
    ...contextBase,
  }
  const phase = await resolveProjectPhase({
    projectId: input.projectId,
    userId: input.userId,
    episodeId: context.episodeId || null,
    currentStage: context.currentStage || null,
  })
  const resolved = await resolveProjectAgentLanguageModel({
    userId: input.userId,
    analysisModelKey,
  })
  const locale = normalizeProjectAgentLocale(context.locale)
  const runtimeMessages = await compressMessages({
    messages: normalizedMessages,
    locale,
    model: resolved.languageModel,
  })

  const stream = createUIMessageStream({
    originalMessages: runtimeMessages,
    execute: async ({ writer }) => {
      const operations = createProjectAgentOperationRegistry()
      const route = await routeProjectAgentRequest({
        messages: runtimeMessages,
        phase,
        context,
        model: resolved.languageModel,
      })
      const executionMode = resolveProjectAgentExecutionMode({
        interactionMode: context.interactionMode,
        routedIntent: route.intent,
      })
      const requestId = getRequestId(input.request)
      projectAgentLogger.info({
        action: route.needsClarification ? 'assistant.route.clarification' : 'assistant.tool.selection',
        message: route.needsClarification ? 'Project agent route requires clarification' : 'Project agent tool selection decided',
        requestId,
        projectId: input.projectId,
        userId: input.userId,
        details: {
          interactionMode: executionMode.interactionMode,
          routedIntent: route.intent,
          effectiveIntent: executionMode.effectiveIntent,
          confidence: route.confidence,
          domains: route.domains,
          toolCategories: route.toolCategories,
          latestUserTextPreview: buildMessagePreview(route.latestUserText),
          ...(route.needsClarification
            ? {
                clarifyingQuestion: route.clarifyingQuestion,
                reasoning: route.reasoning,
              }
            : {}),
        },
      })
      if (route.needsClarification && route.clarifyingQuestion) {
        writer.write({ type: 'start' })
        writer.write({ type: 'start-step' })
        writer.write({ type: 'text-start', id: 'clarification' })
        writer.write({ type: 'text-delta', id: 'clarification', delta: route.clarifyingQuestion })
        writer.write({ type: 'text-end', id: 'clarification' })
        writer.write({ type: 'finish-step' })
        writer.write({ type: 'finish', finishReason: 'stop' })
        return
      }
      const selection = selectProjectAgentTools({
        operations,
        context,
        phase,
        route: {
          ...route,
          intent: executionMode.effectiveIntent,
          reasoning: [
            ...route.reasoning,
            `interactionMode=${executionMode.interactionMode}`,
            `effectiveIntent=${executionMode.effectiveIntent}`,
          ],
        },
        maxTools: 45,
      })
      projectAgentLogger.info({
        action: 'assistant.tool.selection.result',
        message: 'Project agent tool selection result',
        requestId,
        projectId: input.projectId,
        userId: input.userId,
        details: {
          interactionMode: executionMode.interactionMode,
          routedIntent: route.intent,
          effectiveIntent: executionMode.effectiveIntent,
          toolCategories: selection.route.toolCategories,
          totalCandidates: selection.totalCandidates,
          operationIds: selection.operationIds,
          confidence: selection.route.confidence,
        },
      })
      const tools = Object.fromEntries(
        selection.operationIds.map((operationId) => {
          const operation = operations[operationId]
          return [
            operationId,
            tool({
              description: operation.description,
              inputSchema: operation.inputSchema,
              execute: async (args) => {
                return executeProjectAgentOperationFromTool({
                  request: input.request,
                  operationId,
                  projectId: input.projectId,
                  userId: input.userId,
                  context,
                  source: 'assistant-panel',
                  writer,
                  input: args,
                })
              },
            }),
          ]
        }),
      )
      const stopController = createProjectAgentStopController(tools)

      const result = streamText({
        model: resolved.languageModel,
        system: buildProjectAgentSystemPrompt({
          locale,
          projectId: input.projectId,
          episodeId: context.episodeId || 'unknown',
          stage: context.currentStage || 'unknown',
          interactionMode: executionMode.interactionMode,
        }),
        messages: await toModelMessages(runtimeMessages),
        tools,
        stopWhen: stopController.stopWhen,
        onFinish: ({ steps }) => {
          const stopPart = stopController.buildStopPart(steps.length)
          if (!stopPart) return
          writeOperationDataPart<ProjectAgentStopPartData>(writer, 'data-agent-stop', stopPart)
        },
        temperature: 0.2,
      })

      writer.merge(result.toUIMessageStream({
        originalMessages: runtimeMessages,
      }))
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })

  return createUIMessageStreamResponse({ stream })
}
