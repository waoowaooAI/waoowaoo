import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
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
import { getUserModelConfig } from '@/lib/config-service'
import { resolveLlmRuntimeModel } from '@/lib/llm/runtime-shared'
import { executeProjectAgentOperationFromTool } from '@/lib/adapters/tools/execute-project-agent-operation'
import { writeOperationDataPart } from '@/lib/operations/types'
import type { ProjectAgentContext } from './types'
import { resolveProjectPhase } from './project-phase'
import { createProjectAgentStopController } from './stop-conditions'
import type { ProjectAgentStopPartData } from './types'

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
    '在 assistant 对话入口：低风险小操作可直接 act；中/高风险、计费、或 destructive/overwrite/bulk/longRunning 操作必须先征得用户明确确认后再执行（tool 参数中带 confirmed=true）。',
    '重要：所有 tool 返回统一包裹结构：成功为 { ok: true, data: ... }；失败为 { ok: false, error: { code, message, operationId, details?, issues? }, confirmationRequired? }。',
    '当 tool 返回 ok=false：你必须读取 error.code 与 error.message 来决定下一步（例如补参数、先查询再重试、或向用户提问）。',
    '当 tool 返回 confirmationRequired=true：你应向用户解释副作用原因并请求确认，然后在下一次调用同一 tool 时传入 confirmed=true（可参考 confirmation 卡片中的 argsHint）。',
    '当你看到 staleArtifacts 或 failedItems：优先解释原因与推荐动作（例如重跑 workflow、或执行更小粒度的 act 修复）。',
    '你可以使用所有已注册的 tools 来完成任务。tool 定义中已包含使用说明，无需额外列举。',
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
        ]),
      )
      const stopController = createProjectAgentStopController(tools)

      const result = streamText({
        model: resolved.languageModel,
        system: buildProjectAgentSystemPrompt({
          projectId: input.projectId,
          context,
          phaseSummary: [
            `phase=${phase.phase}`,
            `activeRuns=${String(phase.activeRunCount)}`,
            `failedItems=${phase.failedItems.join(';') || '-'}`,
            `staleArtifacts=${phase.staleArtifacts?.join(',') || '-'}`,
            `progress=clips:${String(phase.progress.clipCount)},screenplays:${String(phase.progress.screenplayClipCount)},storyboards:${String(phase.progress.storyboardCount)},panels:${String(phase.progress.panelCount)},voices:${String(phase.progress.voiceLineCount)}`,
            `actions.plan=${phase.availableActions.planMode.join(',') || '-'}`,
            `actions.act=${phase.availableActions.actMode.join(',') || '-'}`,
          ].join(' | '),
        }),
        messages: await toModelMessages(normalizedMessages),
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
        originalMessages: normalizedMessages,
      }))
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })

  return createUIMessageStreamResponse({ stream })
}
