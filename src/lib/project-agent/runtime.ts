import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type UIMessage,
} from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { NextRequest } from 'next/server'
import { getProviderConfig, getProviderKey } from '@/lib/api-config'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'
import { writeOperationDataPart } from '@/lib/operations/types'
import { getUserModelConfig } from '@/lib/config-service'
import { resolveLlmRuntimeModel } from '@/lib/llm/runtime-shared'
import type { ConfirmationRequestPartData, ProjectAgentContext } from './types'
import { resolveProjectPhase } from './project-phase'

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

async function resolveProjectAgentLanguageModel(input: {
  userId: string
  analysisModelKey: string
}): Promise<{
  languageModel: LanguageModel
}> {
  const selection = await resolveLlmRuntimeModel(input.userId, input.analysisModelKey)
  const providerConfig = await getProviderConfig(input.userId, selection.provider)
  const providerKey = getProviderKey(selection.provider)

  if (providerKey === 'google' || providerKey === 'gemini-compatible') {
    const google = createGoogleGenerativeAI({
      apiKey: providerConfig.apiKey,
      ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
      name: providerKey,
    })
    return {
      languageModel: google.chat(selection.modelId),
    }
  }

  const openai = createOpenAI({
    apiKey: providerConfig.apiKey,
    ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
    name: providerKey,
  })
  return {
    languageModel: openai.chat(selection.modelId),
  }
}

function buildProjectAgentSystemPrompt(params: {
  projectId: string
  context: ProjectAgentContext
  phaseSummary: string
}) {
  const episodeId = params.context.episodeId || 'unknown'
  const stage = params.context.currentStage || 'unknown'
  return [
    '你是 novel promotion workspace 的项目级 AI agent。',
    '你的职责是解释、规划、审批驱动和状态汇报，不要自由改写固定 workflow package 的内部顺序。',
    '对于 story-to-script 和 script-to-storyboard，只能通过固定 workflow package 执行。',
    'workflow package 内部 skills 顺序不可更改、不可跳过、不可合并。',
    '当用户要求执行这两条主流程时：先调用 create_workflow_plan，再等待审批；只有用户明确同意后才调用 approve_plan。',
    '当 tool 需要 confirmed=true（会产生写入或计费 side effect）时，必须先向用户说明风险并等待用户明确回复“确认/同意”后再调用。',
    '你可以调用 get_project_phase、get_project_snapshot、get_project_context、list_workflow_packages、create_workflow_plan、approve_plan、reject_plan、list_recent_commands、fetch_workflow_preview、get_task_status、generate_character_image、generate_location_image、modify_asset_image、regenerate_panel_image、panel_variant、mutate_storyboard、voice_design、voice_generate、lip_sync、generate_video、list_recent_mutation_batches、revert_mutation_batch。',
    '回答简洁，用中文。',
    `projectId=${params.projectId}`,
    `episodeId=${episodeId}`,
    `currentStage=${stage}`,
    `projectPhase=${params.phaseSummary}`,
  ].join('\n')
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

  const context = normalizeProjectAgentContext(input.context)
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

  const stream = createUIMessageStream({
    originalMessages: normalizedMessages,
    execute: async ({ writer }) => {
      const operations = createProjectAgentOperationRegistry()
      const tools = Object.fromEntries(
        Object.entries(operations).map(([operationId, operation]) => [
          operationId,
          tool({
            description: operation.description,
            inputSchema: operation.inputSchema,
            execute: async (args) => {
              const requiresConfirmation = operation.sideEffects?.requiresConfirmation ?? (operation.sideEffects?.billable === true)
              if (requiresConfirmation) {
                const confirmed = !!(args && typeof args === 'object' && (args as { confirmed?: unknown }).confirmed === true)
                if (!confirmed) {
                  writeOperationDataPart<ConfirmationRequestPartData>(writer, 'data-confirmation-request', {
                    operationId,
                    summary: operation.sideEffects?.confirmationSummary
                      || `执行 ${operationId} 会产生写入或计费副作用。请在确认后重试，并在参数中带 confirmed=true。`,
                    argsHint: {
                      ...(args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {}),
                      confirmed: true,
                    },
                  })
                  return {
                    confirmationRequired: true,
                    operationId,
                  }
                }
              }

              return operation.execute({
                request: input.request,
                userId: input.userId,
                projectId: input.projectId,
                context,
                writer,
              }, args)
            },
          }),
        ]),
      )

      const result = streamText({
        model: resolved.languageModel,
        system: buildProjectAgentSystemPrompt({
          projectId: input.projectId,
          context,
          phaseSummary: [
            `phase=${phase.phase}`,
            `activeRuns=${String(phase.activeRunCount)}`,
            `progress=clips:${String(phase.progress.clipCount)},screenplays:${String(phase.progress.screenplayClipCount)},storyboards:${String(phase.progress.storyboardCount)},panels:${String(phase.progress.panelCount)},voices:${String(phase.progress.voiceLineCount)}`,
            `actions.plan=${phase.availableActions.planMode.join(',') || '-'}`,
            `actions.act=${phase.availableActions.actMode.join(',') || '-'}`,
          ].join(' | '),
        }),
        messages: await toModelMessages(normalizedMessages),
        tools,
        stopWhen: stepCountIs(6),
        temperature: 0.2,
      })

      writer.merge(result.toUIMessageStream({
        originalMessages: normalizedMessages,
      }))
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })

  return createUIMessageStreamResponse({ stream })
}
