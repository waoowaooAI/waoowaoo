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

function normalizeProjectAgentContext(raw: unknown): ProjectAgentContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  const locale = typeof record.locale === 'string' ? record.locale.trim() : ''
  const episodeId = typeof record.episodeId === 'string' ? record.episodeId.trim() : ''
  const currentStage = typeof record.currentStage === 'string' ? record.currentStage.trim() : ''
  return {
    ...(locale ? { locale } : {}),
    ...(episodeId ? { episodeId } : {}),
    ...(currentStage ? { currentStage } : {}),
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
        route,
        maxTools: 45,
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
          phaseSummary: [
            `phase=${phase.phase}`,
            `activeRuns=${String(phase.activeRunCount)}`,
            `failedItems=${phase.failedItems.join(';') || '-'}`,
            `staleArtifacts=${phase.staleArtifacts?.join(',') || '-'}`,
            `progress=clips:${String(phase.progress.clipCount)},screenplays:${String(phase.progress.screenplayClipCount)},storyboards:${String(phase.progress.storyboardCount)},panels:${String(phase.progress.panelCount)},voices:${String(phase.progress.voiceLineCount)}`,
            `actions.plan=${phase.availableActions.planMode.join(',') || '-'}`,
            `actions.act=${phase.availableActions.actMode.join(',') || '-'}`,
          ].join(' | '),
          toolSummary: [
            `intent=${selection.route.intent}`,
            `domains=${selection.route.domains.join(',')}`,
            `categories=${selection.route.toolCategories.join(',')}`,
            `tools=${String(selection.operationIds.length)}/${String(selection.totalCandidates)}`,
            `confidence=${String(selection.route.confidence)}`,
            `reasoning=${selection.route.reasoning.join(';') || '-'}`,
          ].join(','),
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
