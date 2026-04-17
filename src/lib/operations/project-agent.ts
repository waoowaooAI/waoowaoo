import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { queryTaskTargetStates } from '@/lib/task/state-service'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { executeProjectCommand, approveProjectPlan, listProjectCommands, rejectProjectPlan } from '@/lib/command-center/executor'
import { listSkillCatalogEntries, listWorkflowPackages } from '@/lib/skill-system/catalog'
import { loadScriptPreview, loadStoryboardPreview } from '@/lib/project-agent/preview'
import { resolveProjectPhase } from '@/lib/project-agent/project-phase'
import { assembleProjectProjectionLite } from '@/lib/project-projection/lite'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { getProviderKey, resolveModelSelection, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { estimateVoiceLineMaxSeconds } from '@/lib/voice/generate-voice-line'
import { parseModelKeyStrict, type CapabilityValue } from '@/lib/model-config-contract'
import { hasPanelImageOutput, hasPanelVideoOutput, hasVoiceLineAudioOutput } from '@/lib/task/has-output'
import {
  hasVoiceBindingForProvider,
  parseSpeakerVoiceMap,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'
import { BillingOperationError } from '@/lib/billing/errors'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { resolveBuiltinPricing } from '@/lib/model-pricing/lookup'
import {
  buildAssistantProjectContextSnapshot,
  buildWorkflowApprovalReasons,
  buildWorkflowApprovalSummary,
  buildWorkflowPlanSummary,
} from '@/lib/project-agent/presentation'
import {
  buildRunLifecycleCanonicalEvent,
  buildWorkflowApprovalCanonicalEvent,
  buildWorkflowPlanCanonicalEvent,
} from '@/lib/agent/events/workflow-events'
import type {
  ApprovalRequestPartData,
  ProjectContextPartData,
  ProjectPhasePartData,
  ScriptPreviewPartData,
  StoryboardPreviewPartData,
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
  WorkflowPlanPartData,
  WorkflowStatusPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistry } from './types'
import { writeOperationDataPart } from './types'

const taskTargetSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  types: z.array(z.string().min(1)).optional(),
})

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

function resolveCandidateCount(input?: unknown): number {
  const parsed = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(4, Math.trunc(parsed)))
}

type VoiceLineRow = {
  id: string
  speaker: string
  content: string
}

type CharacterRow = CharacterVoiceFields & {
  name: string
}

function matchCharacterBySpeaker(speaker: string, characters: CharacterRow[]) {
  const normalizedSpeaker = speaker.trim().toLowerCase()
  return characters.find((character) => character.name.trim().toLowerCase() === normalizedSpeaker) || null
}

function hasSpeakerVoiceForProvider(
  speaker: string,
  characters: CharacterRow[],
  speakerVoices: SpeakerVoiceMap,
  providerKey: string,
): boolean {
  const character = matchCharacterBySpeaker(speaker, characters)
  const speakerVoice = speakerVoices[speaker]
  return hasVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toVideoRuntimeSelections(value: unknown): Record<string, CapabilityValue> {
  if (!isRecord(value)) return {}
  const selections: Record<string, CapabilityValue> = {}
  for (const [field, raw] of Object.entries(value)) {
    if (field === 'aspectRatio') continue
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      selections[field] = raw
    }
  }
  return selections
}

function resolveVideoGenerationMode(payload: unknown): 'normal' | 'firstlastframe' {
  if (!isRecord(payload)) return 'normal'
  return isRecord(payload.firstLastFrame) ? 'firstlastframe' : 'normal'
}

function isSeedance2Model(modelKey: string): boolean {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) return false
  return parsed.provider === 'ark'
    && (
      parsed.modelId === 'doubao-seedance-2-0-260128'
      || parsed.modelId === 'doubao-seedance-2-0-fast-260128'
    )
}

function resolveVideoModelKeyFromPayload(payload: Record<string, unknown>): string | null {
  const firstLast = isRecord(payload.firstLastFrame) ? payload.firstLastFrame : null
  if (firstLast && typeof firstLast.flModel === 'string' && parseModelKeyStrict(firstLast.flModel)) {
    return firstLast.flModel
  }
  if (typeof payload.videoModel === 'string' && parseModelKeyStrict(payload.videoModel)) {
    return payload.videoModel
  }
  return null
}

function requireVideoModelKeyFromPayload(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.videoModel !== 'string' || !parseModelKeyStrict(payload.videoModel)) {
    throw new Error('PROJECT_AGENT_VIDEO_MODEL_REQUIRED')
  }
  return payload.videoModel
}

function validateFirstLastFrameModel(input: unknown) {
  if (input === undefined || input === null) return
  if (!isRecord(input)) {
    throw new Error('PROJECT_AGENT_FIRSTLASTFRAME_PAYLOAD_INVALID')
  }

  const flModel = input.flModel
  if (typeof flModel !== 'string' || !parseModelKeyStrict(flModel)) {
    throw new Error('PROJECT_AGENT_FIRSTLASTFRAME_MODEL_INVALID')
  }

  const capabilities = resolveBuiltinCapabilitiesByModelKey('video', flModel)
  if (capabilities?.video?.firstlastframe !== true) {
    throw new Error('PROJECT_AGENT_FIRSTLASTFRAME_MODEL_UNSUPPORTED')
  }
}

async function validateVideoCapabilityCombination(input: {
  payload: unknown
  projectId: string
  userId: string
}) {
  const payload = input.payload
  if (!isRecord(payload)) return
  const modelKey = resolveVideoModelKeyFromPayload(payload)
  if (!modelKey) return

  const builtinCaps = resolveBuiltinCapabilitiesByModelKey('video', modelKey)
  if (!builtinCaps) return

  const runtimeSelections = toVideoRuntimeSelections(payload.generationOptions)
  runtimeSelections.generationMode = resolveVideoGenerationMode(payload)

  const resolvedOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: input.projectId,
    userId: input.userId,
    modelType: 'video',
    modelKey,
    runtimeSelections,
  })

  const resolution = resolveBuiltinPricing({
    apiType: 'video',
    model: modelKey,
    selections: {
      ...resolvedOptions,
      ...(isSeedance2Model(modelKey) ? { containsVideoInput: false } : {}),
    },
  })
  if (resolution.status === 'missing_capability_match') {
    throw new Error('PROJECT_AGENT_VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED')
  }
}

function buildVideoPanelBillingInfoOrThrow(payload: unknown) {
  try {
    return buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, isRecord(payload) ? payload : null)
  } catch (error) {
    if (
      error instanceof BillingOperationError
      && (
        error.code === 'BILLING_UNKNOWN_VIDEO_CAPABILITY_COMBINATION'
        || error.code === 'BILLING_UNKNOWN_VIDEO_RESOLUTION'
      )
    ) {
      throw new Error('PROJECT_AGENT_VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED')
    }
    if (error instanceof BillingOperationError && error.code === 'BILLING_UNKNOWN_MODEL') {
      return null
    }
    throw error
  }
}

export function createProjectAgentOperationRegistry(): ProjectAgentOperationRegistry {
  return {
    get_project_phase: {
      description: 'Resolve the current project phase, progress and available next actions.',
      sideEffects: { mode: 'query', risk: 'none' },
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const snapshot = await resolveProjectPhase({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectPhasePartData>(ctx.writer, 'data-project-phase', {
          phase: snapshot.phase,
          snapshot,
        })
        return snapshot
      },
    },
    get_project_snapshot: {
      description: 'Load a lightweight project snapshot projection suitable for planning and prompt context.',
      sideEffects: { mode: 'query', risk: 'low' },
      inputSchema: z.object({}),
      execute: async (ctx) => assembleProjectProjectionLite({
        projectId: ctx.projectId,
        userId: ctx.userId,
        episodeId: ctx.context.episodeId || null,
        currentStage: ctx.context.currentStage || null,
      }),
    },
    get_project_context: {
      description: 'Load the current project and episode context snapshot.',
      sideEffects: { mode: 'query', risk: 'low' },
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const projectContext = await assembleProjectContext({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectContextPartData>(ctx.writer, 'data-project-context', {
          context: buildAssistantProjectContextSnapshot(projectContext),
        })
        return buildAssistantProjectContextSnapshot(projectContext)
      },
    },
    list_workflow_packages: {
      description: 'List available workflow packages and skill catalog entries.',
      sideEffects: { mode: 'query', risk: 'none' },
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
    },
    create_workflow_plan: {
      description: 'Create a persisted command and plan for a fixed workflow package.',
      sideEffects: { mode: 'plan', risk: 'low' },
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
        content: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: 'assistant-panel',
            workflowId: input.workflowId,
            episodeId: input.episodeId || ctx.context.episodeId || undefined,
            input: {
              ...(input.content ? { content: input.content } : {}),
            },
          },
        })
        const planData: WorkflowPlanPartData = {
          workflowId: input.workflowId,
          commandId: result.commandId,
          planId: result.planId,
          summary: buildWorkflowPlanSummary(input.workflowId),
          requiresApproval: result.requiresApproval,
          event: buildWorkflowPlanCanonicalEvent({
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
          }),
          steps: result.steps.map((step) => ({
            skillId: step.skillId,
            title: step.title,
          })),
        }
        writeOperationDataPart(ctx.writer, 'data-workflow-plan', planData)
        if (result.requiresApproval) {
          const approvalData: ApprovalRequestPartData = {
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
            summary: buildWorkflowApprovalSummary(input.workflowId),
            reasons: buildWorkflowApprovalReasons(result.steps),
            event: buildWorkflowApprovalCanonicalEvent({
              workflowId: input.workflowId,
              planId: result.planId,
              status: 'pending',
            }),
          }
          writeOperationDataPart(ctx.writer, 'data-approval-request', approvalData)
        } else {
          const statusData: WorkflowStatusPartData = {
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
            runId: result.linkedRunId,
            status: result.status,
            activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
            event: result.linkedRunId
              ? buildRunLifecycleCanonicalEvent({
                  workflowId: input.workflowId,
                  runId: result.linkedRunId,
                  status: 'start',
                })
              : null,
          }
          writeOperationDataPart(ctx.writer, 'data-workflow-status', statusData)
        }
        return result
      },
    },
    approve_plan: {
      description: 'Approve a pending workflow plan and enqueue execution.',
      sideEffects: {
        mode: 'plan',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将批准并执行 workflow plan（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        planId: z.string().min(1),
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        confirmed: z.boolean().optional(),
      }),
      execute: async (ctx, input) => {
        const result = await approveProjectPlan({
          request: ctx.request,
          userId: ctx.userId,
          planId: input.planId,
        })
        writeOperationDataPart<WorkflowStatusPartData>(ctx.writer, 'data-workflow-status', {
          workflowId: input.workflowId,
          commandId: result.commandId,
          planId: result.planId,
          runId: result.linkedRunId,
          status: result.status,
          activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
          event: result.linkedRunId
            ? buildRunLifecycleCanonicalEvent({
                workflowId: input.workflowId,
                runId: result.linkedRunId,
                status: 'start',
              })
            : null,
        })
        return result
      },
    },
    reject_plan: {
      description: 'Reject a pending workflow plan.',
      sideEffects: { mode: 'plan', risk: 'low' },
      inputSchema: z.object({
        planId: z.string().min(1),
        note: z.string().optional(),
      }),
      execute: async (_, input) => rejectProjectPlan({
        planId: input.planId,
        note: input.note,
      }),
    },
    list_recent_commands: {
      description: 'List recent command and run status for the current project or episode.',
      sideEffects: { mode: 'query', risk: 'low' },
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: async (ctx, input) =>
        listProjectCommands({
          projectId: ctx.projectId,
          episodeId: ctx.context.episodeId || null,
          limit: input.limit || 10,
        }),
    },
    fetch_workflow_preview: {
      description: 'Load a rendered preview for the latest workflow artifacts.',
      sideEffects: { mode: 'query', risk: 'low' },
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const resolvedEpisodeId = input.episodeId || ctx.context.episodeId || ''
        if (!resolvedEpisodeId) {
          throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
        }
        if (input.workflowId === 'story-to-script') {
          const preview = await loadScriptPreview({ episodeId: resolvedEpisodeId })
          writeOperationDataPart<ScriptPreviewPartData>(ctx.writer, 'data-script-preview', preview)
          return preview
        }
        const preview = await loadStoryboardPreview({ episodeId: resolvedEpisodeId })
        writeOperationDataPart<StoryboardPreviewPartData>(ctx.writer, 'data-storyboard-preview', preview)
        return preview
      },
    },
    get_task_status: {
      description: 'Query task target states for one or more project targets.',
      sideEffects: { mode: 'query', risk: 'none' },
      inputSchema: z.object({
        targets: z.array(taskTargetSchema).min(1).max(50),
      }),
      execute: async (ctx, input) => ({
        states: await queryTaskTargetStates({
          projectId: ctx.projectId,
          userId: ctx.userId,
          targets: input.targets,
        }),
      }),
    },
    generate_character_image: {
      description: 'Generate character appearance images for a project character.',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将为角色生成形象图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1).optional(),
        characterName: z.string().min(1).optional(),
        appearanceId: z.string().min(1).optional(),
        appearanceIndex: z.number().int().min(0).max(20).optional(),
        count: z.number().int().positive().max(4).optional(),
        imageIndex: z.number().int().min(0).max(20).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.characterId || value.characterName), {
        message: 'characterId or characterName is required',
        path: ['characterId'],
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let characterId = normalizeString(input.characterId)
        const characterName = normalizeString(input.characterName)
        if (!characterId) {
          const exact = await prisma.projectCharacter.findFirst({
            where: {
              projectId: ctx.projectId,
              name: characterName,
            },
            select: { id: true },
          })
          if (exact) {
            characterId = exact.id
          } else {
            const fuzzy = await prisma.projectCharacter.findFirst({
              where: {
                projectId: ctx.projectId,
                name: {
                  contains: characterName,
                },
              },
              select: { id: true },
            })
            if (fuzzy) {
              characterId = fuzzy.id
            }
          }
        }
        if (!characterId) {
          throw new Error('PROJECT_AGENT_CHARACTER_NOT_FOUND')
        }

        let appearanceId = normalizeString(input.appearanceId)
        if (!appearanceId) {
          const appearance = await prisma.characterAppearance.findFirst({
            where: { characterId },
            orderBy: { appearanceIndex: 'asc' },
            select: { id: true },
          })
          appearanceId = appearance?.id || ''
        }

        const body: Record<string, unknown> = {
          meta: {
            locale,
          },
          ...(appearanceId ? { appearanceId } : {}),
          ...(typeof input.appearanceIndex === 'number' ? { appearanceIndex: input.appearanceIndex } : {}),
          ...(typeof input.count === 'number' ? { count: input.count } : {}),
          ...(typeof input.imageIndex === 'number' ? { imageIndex: input.imageIndex } : {}),
          ...(normalizeString(input.artStyle) ? { artStyle: normalizeString(input.artStyle) } : {}),
        }

        const result = await submitAssetGenerateTask({
          request: ctx.request,
          kind: 'character',
          assetId: characterId,
          body,
          access: {
            scope: 'project',
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_character_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          characterId,
          appearanceId: appearanceId || null,
        }
      },
    },
    generate_location_image: {
      description: 'Generate location images for a project location.',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将为场景生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1).optional(),
        locationName: z.string().min(1).optional(),
        count: z.number().int().positive().max(4).optional(),
        imageIndex: z.number().int().min(0).max(50).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.locationId || value.locationName), {
        message: 'locationId or locationName is required',
        path: ['locationId'],
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let locationId = normalizeString(input.locationId)
        const locationName = normalizeString(input.locationName)
        if (!locationId) {
          const exact = await prisma.projectLocation.findFirst({
            where: {
              projectId: ctx.projectId,
              name: locationName,
            },
            select: { id: true },
          })
          if (exact) {
            locationId = exact.id
          } else {
            const fuzzy = await prisma.projectLocation.findFirst({
              where: {
                projectId: ctx.projectId,
                name: {
                  contains: locationName,
                },
              },
              select: { id: true },
            })
            if (fuzzy) {
              locationId = fuzzy.id
            }
          }
        }
        if (!locationId) {
          throw new Error('PROJECT_AGENT_LOCATION_NOT_FOUND')
        }

        const body: Record<string, unknown> = {
          meta: {
            locale,
          },
          ...(typeof input.count === 'number' ? { count: input.count } : {}),
          ...(typeof input.imageIndex === 'number' ? { imageIndex: input.imageIndex } : {}),
          ...(normalizeString(input.artStyle) ? { artStyle: normalizeString(input.artStyle) } : {}),
        }

        const result = await submitAssetGenerateTask({
          request: ctx.request,
          kind: 'location',
          assetId: locationId,
          body,
          access: {
            scope: 'project',
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_location_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          locationId,
        }
      },
    },
    regenerate_panel_image: {
      description: 'Regenerate storyboard panel images (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将为分镜格子重新生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        panelId: z.string().min(1).optional(),
        storyboardId: z.string().min(1).optional(),
        panelIndex: z.number().int().min(0).max(1000).optional(),
        count: z.number().int().positive().max(4).optional(),
      }).refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
        message: 'panelId or (storyboardId + panelIndex) is required',
        path: ['panelId'],
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let panelId = normalizeString(input.panelId)
        if (!panelId) {
          const storyboardId = normalizeString(input.storyboardId)
          const panelIndex = typeof input.panelIndex === 'number' ? input.panelIndex : NaN
          if (!storyboardId || !Number.isFinite(panelIndex)) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }
          const panel = await prisma.projectPanel.findFirst({
            where: {
              storyboardId,
              panelIndex,
            },
            select: { id: true },
          })
          panelId = panel?.id || ''
        }

        if (!panelId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const candidateCount = resolveCandidateCount(input.count)
        const body = {
          panelId,
          candidateCount,
          count: candidateCount,
          meta: {
            locale,
          },
        }

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!projectModelConfig.storyboardModel) {
          throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
        }
        await resolveModelSelection(ctx.userId, projectModelConfig.storyboardModel, 'image')
        const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
          projectId: ctx.projectId,
          userId: ctx.userId,
          modelType: 'image',
          modelKey: projectModelConfig.storyboardModel,
        })

        const billingPayload = {
          ...body,
          imageModel: projectModelConfig.storyboardModel,
          ...(Object.keys(capabilityOptions).length > 0 ? { generationOptions: capabilityOptions } : {}),
        }

        const hasOutputAtStart = await hasPanelImageOutput(panelId)

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, body),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.IMAGE_PANEL,
          targetType: 'ProjectPanel',
          targetId: panelId,
          payload: withTaskUiPayload(billingPayload, {
            intent: 'regenerate',
            hasOutputAtStart,
          }),
          dedupeKey: `image_panel:${panelId}:${candidateCount}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, billingPayload),
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'regenerate_panel_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          panelId,
        }
      },
    },
    voice_generate: {
      description: 'Generate voice line audio for one or more voice lines (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将生成配音（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1).optional(),
        lineId: z.string().min(1).optional(),
        all: z.boolean().optional(),
        audioModel: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const episodeId = normalizeString(input.episodeId) || normalizeString(ctx.context.episodeId)
        const lineId = normalizeString(input.lineId)
        const all = input.all === true
        const requestedAudioModel = normalizeString(input.audioModel)

        if (!episodeId) {
          throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
        }
        if (!all && !lineId) {
          throw new Error('PROJECT_AGENT_VOICE_LINE_REQUIRED')
        }
        if (requestedAudioModel && !parseModelKeyStrict(requestedAudioModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }

        const [pref, projectData, episode] = await Promise.all([
          prisma.userPreference.findUnique({
            where: { userId: ctx.userId },
            select: { audioModel: true },
          }),
          prisma.project.findUnique({
            where: { id: ctx.projectId },
            select: {
              id: true,
              audioModel: true,
              characters: {
                select: {
                  name: true,
                  customVoiceUrl: true,
                  voiceId: true,
                },
              },
            },
          }),
          prisma.projectEpisode.findFirst({
            where: {
              id: episodeId,
              projectId: ctx.projectId,
            },
            select: {
              id: true,
              speakerVoices: true,
            },
          }),
        ])

        if (!projectData || !episode) {
          throw new Error('PROJECT_AGENT_NOT_FOUND')
        }

        const preferredAudioModel = normalizeString(pref?.audioModel)
        if (preferredAudioModel && !parseModelKeyStrict(preferredAudioModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }
        const projectAudioModel = normalizeString(projectData.audioModel)
        if (projectAudioModel && !parseModelKeyStrict(projectAudioModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }

        const resolvedAudioModel = requestedAudioModel || projectAudioModel || preferredAudioModel
        const selectedResolvedAudioModel = await resolveModelSelectionOrSingle(
          ctx.userId,
          resolvedAudioModel || null,
          'audio',
        )
        const selectedProviderKey = getProviderKey(selectedResolvedAudioModel.provider).toLowerCase()

        const speakerVoices = parseSpeakerVoiceMap(episode.speakerVoices)
        const characters = (projectData.characters || []) as CharacterRow[]

        let voiceLines: VoiceLineRow[] = []
        if (all) {
          const allLines = await prisma.projectVoiceLine.findMany({
            where: {
              episodeId,
              audioUrl: null,
            },
            orderBy: { lineIndex: 'asc' },
            select: {
              id: true,
              speaker: true,
              content: true,
            },
          })
          voiceLines = allLines.filter((line) =>
            hasSpeakerVoiceForProvider(line.speaker, characters, speakerVoices, selectedProviderKey),
          )
        } else {
          const line = await prisma.projectVoiceLine.findFirst({
            where: {
              id: lineId,
              episodeId,
            },
            select: {
              id: true,
              speaker: true,
              content: true,
            },
          })
          if (!line) {
            throw new Error('PROJECT_AGENT_VOICE_LINE_NOT_FOUND')
          }
          if (!hasSpeakerVoiceForProvider(line.speaker, characters, speakerVoices, selectedProviderKey)) {
            throw new Error('PROJECT_AGENT_VOICE_BINDING_REQUIRED')
          }
          voiceLines = [line]
        }

        if (voiceLines.length === 0) {
          return {
            success: true,
            async: true,
            results: [],
            taskIds: [],
            total: 0,
            error: '没有需要生成的台词（可能是已生成或缺少音色绑定）',
          }
        }

        const localeForTask = resolveRequiredTaskLocale(ctx.request, { meta: { locale } })
        const results = await Promise.all(
          voiceLines.map(async (line) => {
            const payload = {
              episodeId,
              lineId: line.id,
              maxSeconds: estimateVoiceLineMaxSeconds(line.content),
              audioModel: selectedResolvedAudioModel.modelKey,
              meta: {
                locale,
              },
            }
            const result = await submitTask({
              userId: ctx.userId,
              locale: localeForTask,
              requestId: getRequestId(ctx.request),
              projectId: ctx.projectId,
              episodeId,
              type: TASK_TYPE.VOICE_LINE,
              targetType: 'ProjectVoiceLine',
              targetId: line.id,
              payload: withTaskUiPayload(payload, {
                hasOutputAtStart: await hasVoiceLineAudioOutput(line.id),
              }),
              dedupeKey: `voice_line:${line.id}`,
              billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, payload),
            })
            return {
              refId: line.id,
              taskId: result.taskId,
              status: result.status,
            }
          }),
        )

        const taskIds = results.map((item) => item.taskId)
        if (!all) {
          writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
            operationId: 'voice_generate',
            taskId: taskIds[0] || '',
            status: results[0]?.status || 'queued',
          })
          return {
            success: true,
            async: true,
            taskId: taskIds[0],
          }
        }

        writeOperationDataPart<TaskBatchSubmittedPartData>(ctx.writer, 'data-task-batch-submitted', {
          operationId: 'voice_generate',
          total: taskIds.length,
          taskIds,
          results: results.map((item) => ({ refId: item.refId, taskId: item.taskId })),
        })

        return {
          success: true,
          async: true,
          results: results.map((item) => ({ lineId: item.refId, taskId: item.taskId })),
          taskIds,
          total: taskIds.length,
        }
      },
    },
    generate_video: {
      description: 'Generate panel videos for a storyboard panel or an episode batch (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将生成视频（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        all: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
        episodeId: z.string().min(1).optional(),
        panelId: z.string().min(1).optional(),
        storyboardId: z.string().min(1).optional(),
        panelIndex: z.number().int().min(0).max(2000).optional(),
        videoModel: z.string().min(1),
        firstLastFrame: z.unknown().optional(),
        generationOptions: z.record(z.unknown()).optional(),
      }).passthrough(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const inputRecord = isRecord(input) ? input : ({} as Record<string, unknown>)
        const existingMeta = isRecord(inputRecord.meta) ? inputRecord.meta : {}
        const payload: Record<string, unknown> = {
          ...inputRecord,
          meta: {
            ...existingMeta,
            locale,
          },
        }
        delete payload.confirmed

        requireVideoModelKeyFromPayload(payload)
        validateFirstLastFrameModel(payload.firstLastFrame)
        await validateVideoCapabilityCombination({
          payload,
          projectId: ctx.projectId,
          userId: ctx.userId,
        })

        const localeForTask = resolveRequiredTaskLocale(ctx.request, payload)
        const isBatch = payload.all === true
        if (isBatch) {
          const episodeId = normalizeString(payload.episodeId) || normalizeString(ctx.context.episodeId)
          if (!episodeId) {
            throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
          }
          const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : 20

          const panels = await prisma.projectPanel.findMany({
            where: {
              storyboard: { episodeId },
              imageUrl: { not: null },
              OR: [
                { videoUrl: null },
                { videoUrl: '' },
              ],
            },
            select: { id: true },
            take: limit,
          })

          if (panels.length === 0) {
            return { tasks: [], total: 0 }
          }

          const tasks = await Promise.all(
            panels.map(async (panel) =>
              submitTask({
                userId: ctx.userId,
                locale: localeForTask,
                requestId: getRequestId(ctx.request),
                projectId: ctx.projectId,
                episodeId,
                type: TASK_TYPE.VIDEO_PANEL,
                targetType: 'ProjectPanel',
                targetId: panel.id,
                payload: withTaskUiPayload(payload, {
                  hasOutputAtStart: await hasPanelVideoOutput(panel.id),
                }),
                dedupeKey: `video_panel:${panel.id}`,
                billingInfo: buildVideoPanelBillingInfoOrThrow(payload),
              }),
            ),
          )

          const taskIds = tasks.map((task) => task.taskId)
          writeOperationDataPart<TaskBatchSubmittedPartData>(ctx.writer, 'data-task-batch-submitted', {
            operationId: 'generate_video',
            total: tasks.length,
            taskIds,
            results: panels.map((panel, index) => ({ refId: panel.id, taskId: taskIds[index] || '' })),
          })

          return {
            tasks,
            total: tasks.length,
          }
        }

        let panelId = normalizeString(payload.panelId)
        if (!panelId) {
          const storyboardId = normalizeString(payload.storyboardId)
          const panelIndex = typeof payload.panelIndex === 'number' ? payload.panelIndex : NaN
          if (!storyboardId || !Number.isFinite(panelIndex)) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }
          const panel = await prisma.projectPanel.findFirst({
            where: { storyboardId, panelIndex: Number(panelIndex) },
            select: { id: true },
          })
          panelId = panel?.id || ''
        }
        if (!panelId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const result = await submitTask({
          userId: ctx.userId,
          locale: localeForTask,
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.VIDEO_PANEL,
          targetType: 'ProjectPanel',
          targetId: panelId,
          payload: withTaskUiPayload(payload, {
            hasOutputAtStart: await hasPanelVideoOutput(panelId),
          }),
          dedupeKey: `video_panel:${panelId}`,
          billingInfo: buildVideoPanelBillingInfoOrThrow(payload),
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_video',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          panelId,
        }
      },
    },
  }
}
