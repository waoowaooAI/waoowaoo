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
  type UIMessageStreamWriter,
} from 'ai'
import { z } from 'zod'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { NextRequest } from 'next/server'
import { getProviderConfig, getProviderKey } from '@/lib/api-config'
import {
  buildRunLifecycleCanonicalEvent,
  buildWorkflowApprovalCanonicalEvent,
  buildWorkflowPlanCanonicalEvent,
} from '@/lib/agent/events/workflow-events'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { getUserModelConfig } from '@/lib/config-service'
import { resolveLlmRuntimeModel } from '@/lib/llm/runtime-shared'
import { executeProjectCommand, approveProjectPlan, listProjectCommands, rejectProjectPlan } from '@/lib/command-center/executor'
import { listSkillCatalogEntries, listWorkflowPackages } from '@/lib/skill-system/catalog'
import { loadScriptPreview, loadStoryboardPreview } from './preview'
import {
  buildAssistantProjectContextSnapshot,
  buildWorkflowApprovalReasons,
  buildWorkflowApprovalSummary,
  buildWorkflowPlanSummary,
} from './presentation'
import type {
  ApprovalRequestPartData,
  ProjectAgentContext,
  ProjectContextPartData,
  ScriptPreviewPartData,
  StoryboardPreviewPartData,
  WorkflowPlanPartData,
  WorkflowStatusPartData,
  WorkspaceAssistantPartType,
} from './types'

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

function writeDataPart<T>(writer: UIMessageStreamWriter<UIMessage>, type: WorkspaceAssistantPartType, data: T) {
  writer.write({
    type,
    data,
  })
}

function buildProjectAgentSystemPrompt(params: {
  projectId: string
  context: ProjectAgentContext
}) {
  const episodeId = params.context.episodeId || 'unknown'
  const stage = params.context.currentStage || 'unknown'
  return [
    '你是 novel promotion workspace 的项目级 AI agent。',
    '你的职责是解释、规划、审批驱动和状态汇报，不要自由改写固定 workflow package 的内部顺序。',
    '对于 story-to-script 和 script-to-storyboard，只能通过固定 workflow package 执行。',
    'workflow package 内部 skills 顺序不可更改、不可跳过、不可合并。',
    '当用户要求执行这两条主流程时：先调用 create_workflow_plan，再等待审批；只有用户明确同意后才调用 approve_plan。',
    '你可以调用 get_project_context、list_workflow_packages、create_workflow_plan、approve_plan、reject_plan、list_recent_commands、fetch_workflow_preview。',
    '回答简洁，用中文。',
    `projectId=${params.projectId}`,
    `episodeId=${episodeId}`,
    `currentStage=${stage}`,
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
  const resolved = await resolveProjectAgentLanguageModel({
    userId: input.userId,
    analysisModelKey,
  })

  const stream = createUIMessageStream({
    originalMessages: normalizedMessages,
    execute: async ({ writer }) => {
      const tools = {
        get_project_context: tool({
          description: 'Load the current project and episode context snapshot.',
          inputSchema: z.object({}),
          execute: async () => {
            const projectContext = await assembleProjectContext({
              projectId: input.projectId,
              userId: input.userId,
              episodeId: context.episodeId || null,
              currentStage: context.currentStage || null,
            })
            writeDataPart<ProjectContextPartData>(writer, 'data-project-context', {
              context: buildAssistantProjectContextSnapshot(projectContext),
            })
            return buildAssistantProjectContextSnapshot(projectContext)
          },
        }),
        list_workflow_packages: tool({
          description: 'List available workflow packages and skill catalog entries.',
          inputSchema: z.object({}),
          execute: async () => ({
            workflows: listWorkflowPackages().map((workflowPackage) => ({
              id: workflowPackage.manifest.id,
              name: workflowPackage.manifest.name,
              summary: workflowPackage.manifest.summary,
              requiresApproval: workflowPackage.manifest.requiresApproval,
              skills: workflowPackage.steps.map((step) => step.skillId),
            })),
            catalog: listSkillCatalogEntries(),
          }),
        }),
        create_workflow_plan: tool({
          description: 'Create a persisted command and plan for a fixed workflow package.',
          inputSchema: z.object({
            workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
            episodeId: z.string().optional(),
            content: z.string().optional(),
          }),
          execute: async ({ workflowId, episodeId, content }) => {
            const result = await executeProjectCommand({
              request: input.request,
              projectId: input.projectId,
              userId: input.userId,
              body: {
                commandType: 'run_workflow_package',
                source: 'assistant-panel',
                workflowId,
                episodeId: episodeId || context.episodeId || undefined,
                input: {
                  ...(content ? { content } : {}),
                },
              },
            })
            const planData: WorkflowPlanPartData = {
              workflowId,
              commandId: result.commandId,
              planId: result.planId,
              summary: buildWorkflowPlanSummary(workflowId),
              requiresApproval: result.requiresApproval,
              event: buildWorkflowPlanCanonicalEvent({
                workflowId,
                commandId: result.commandId,
                planId: result.planId,
              }),
              steps: result.steps.map((step) => ({
                skillId: step.skillId,
                title: step.title,
              })),
            }
            writeDataPart(writer, 'data-workflow-plan', planData)
            if (result.requiresApproval) {
              const approvalData: ApprovalRequestPartData = {
                workflowId,
                commandId: result.commandId,
                planId: result.planId,
                summary: buildWorkflowApprovalSummary(workflowId),
                reasons: buildWorkflowApprovalReasons(result.steps),
                event: buildWorkflowApprovalCanonicalEvent({
                  workflowId,
                  planId: result.planId,
                  status: 'pending',
                }),
              }
              writeDataPart(writer, 'data-approval-request', approvalData)
            } else {
              const statusData: WorkflowStatusPartData = {
                workflowId,
                commandId: result.commandId,
                planId: result.planId,
                runId: result.linkedRunId,
                status: result.status,
                activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
                event: result.linkedRunId
                  ? buildRunLifecycleCanonicalEvent({
                      workflowId,
                      runId: result.linkedRunId,
                      status: 'start',
                    })
                  : null,
              }
              writeDataPart(writer, 'data-workflow-status', statusData)
            }
            return result
          },
        }),
        approve_plan: tool({
          description: 'Approve a pending workflow plan and enqueue execution.',
          inputSchema: z.object({
            planId: z.string().min(1),
            workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
          }),
          execute: async ({ planId, workflowId }) => {
            const result = await approveProjectPlan({
              request: input.request,
              userId: input.userId,
              planId,
            })
            writeDataPart<WorkflowStatusPartData>(writer, 'data-workflow-status', {
              workflowId,
              commandId: result.commandId,
              planId: result.planId,
              runId: result.linkedRunId,
              status: result.status,
              activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
              event: result.linkedRunId
                ? buildRunLifecycleCanonicalEvent({
                    workflowId,
                    runId: result.linkedRunId,
                    status: 'start',
                  })
                : null,
            })
            return result
          },
        }),
        reject_plan: tool({
          description: 'Reject a pending workflow plan.',
          inputSchema: z.object({
            planId: z.string().min(1),
            note: z.string().optional(),
          }),
          execute: async ({ planId, note }) => {
            const result = await rejectProjectPlan({
              planId,
              note,
            })
            return result
          },
        }),
        list_recent_commands: tool({
          description: 'List recent command and run status for the current project or episode.',
          inputSchema: z.object({
            limit: z.number().int().positive().max(20).optional(),
          }),
          execute: async ({ limit }) => {
            return await listProjectCommands({
              projectId: input.projectId,
              episodeId: context.episodeId || null,
              limit: limit || 10,
            })
          },
        }),
        fetch_workflow_preview: tool({
          description: 'Load a rendered preview for the latest workflow artifacts.',
          inputSchema: z.object({
            workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
            episodeId: z.string().optional(),
          }),
          execute: async ({ workflowId, episodeId }) => {
            const resolvedEpisodeId = episodeId || context.episodeId || ''
            if (!resolvedEpisodeId) {
              throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
            }
            if (workflowId === 'story-to-script') {
              const preview = await loadScriptPreview({ episodeId: resolvedEpisodeId })
              writeDataPart<ScriptPreviewPartData>(writer, 'data-script-preview', preview)
              return preview
            }
            const preview = await loadStoryboardPreview({ episodeId: resolvedEpisodeId })
            writeDataPart<StoryboardPreviewPartData>(writer, 'data-storyboard-preview', preview)
            return preview
          },
        }),
      }

      const result = streamText({
        model: resolved.languageModel,
        system: buildProjectAgentSystemPrompt({
          projectId: input.projectId,
          context,
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
