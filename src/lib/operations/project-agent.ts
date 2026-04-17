import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { queryTaskTargetStates } from '@/lib/task/state-service'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { executeProjectCommand, approveProjectPlan, listProjectCommands, rejectProjectPlan } from '@/lib/command-center/executor'
import { listSkillCatalogEntries, listWorkflowPackages } from '@/lib/skill-system/catalog'
import { loadScriptPreview, loadStoryboardPreview } from '@/lib/project-agent/preview'
import { resolveProjectPhase } from '@/lib/project-agent/project-phase'
import { assembleProjectProjectionLite } from '@/lib/project-projection/lite'
import { submitAssetGenerateTask, submitAssetModifyTask } from '@/lib/assets/services/asset-actions'
import { createHash, randomUUID } from 'crypto'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { buildImageBillingPayload, getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { getProviderKey, resolveModelSelection, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { estimateVoiceLineMaxSeconds } from '@/lib/voice/generate-voice-line'
import { composeModelKey, parseModelKeyStrict, type CapabilityValue } from '@/lib/model-config-contract'
import { hasPanelImageOutput, hasPanelLipSyncOutput, hasPanelVideoOutput, hasVoiceLineAudioOutput } from '@/lib/task/has-output'
import {
  hasVoiceBindingForProvider,
  parseSpeakerVoiceMap,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'
import { BillingOperationError } from '@/lib/billing/errors'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { resolveBuiltinPricing } from '@/lib/model-pricing/lookup'
import { validatePreviewText, validateVoicePrompt } from '@/lib/providers/bailian/voice-design'
import { createMutationBatch, listRecentMutationBatches } from '@/lib/mutation-batch/service'
import { revertMutationBatch } from '@/lib/mutation-batch/revert'
import { resolveInsertPanelUserInput } from '@/lib/project-workflow/insert-panel'
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

const DEFAULT_LIPSYNC_MODEL_KEY = composeModelKey('fal', 'fal-ai/kling-video/lipsync/audio-to-video')

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
  audioUrl?: string | null
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

function createPanelVariantId(): string {
  try {
    return randomUUID()
  } catch {
    return `panel-variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

async function rollbackCreatedVariantPanel(params: {
  panelId: string
  storyboardId: string
  panelIndex: number
}) {
  await prisma.$transaction(async (tx) => {
    await tx.projectPanel.delete({
      where: { id: params.panelId },
    })

    const maxPanel = await tx.projectPanel.findFirst({
      where: { storyboardId: params.storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    const maxPanelIndex = maxPanel?.panelIndex ?? -1
    const offset = maxPanelIndex + 1000

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex },
      },
      data: {
        panelIndex: { increment: offset },
        panelNumber: { increment: offset },
      },
    })

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex + offset },
      },
      data: {
        panelIndex: { decrement: offset + 1 },
        panelNumber: { decrement: offset + 1 },
      },
    })

    const panelCount = await tx.projectPanel.count({
      where: { storyboardId: params.storyboardId },
    })

    await tx.projectStoryboard.update({
      where: { id: params.storyboardId },
      data: { panelCount },
    })
  })
}

async function deletePanelAndReindex(params: {
  panelId: string
  storyboardId: string
  panelIndex: number
}) {
  await rollbackCreatedVariantPanel(params)
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
    list_recent_mutation_batches: {
      description: 'List recent mutation batches that can be reverted (undo).',
      sideEffects: { mode: 'query', risk: 'low' },
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: async (ctx, input) => {
        const batches = await listRecentMutationBatches({
          projectId: ctx.projectId,
          userId: ctx.userId,
          limit: input.limit || 10,
        })
        return batches.map((batch) => ({
          id: batch.id,
          status: batch.status,
          source: batch.source,
          operationId: batch.operationId,
          summary: batch.summary,
          createdAt: batch.createdAt.toISOString(),
          revertedAt: batch.revertedAt ? batch.revertedAt.toISOString() : null,
          entryCount: batch.entries.length,
          entries: batch.entries.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            targetType: entry.targetType,
            targetId: entry.targetId,
            createdAt: entry.createdAt.toISOString(),
          })),
        }))
      },
    },
    revert_mutation_batch: {
      description: 'Revert (undo) a mutation batch by id.',
      sideEffects: {
        mode: 'plan',
        risk: 'high',
        requiresConfirmation: true,
        confirmationSummary: '将撤回一次批量变更（可能删除或覆盖已有内容）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        batchId: z.string().min(1),
      }),
      execute: async (ctx, input) => revertMutationBatch({
        batchId: input.batchId,
        projectId: ctx.projectId,
        userId: ctx.userId,
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

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'generate_character_image',
          summary: `generate_character_image:${characterId}`,
          entries: [
            {
              kind: 'asset_render_revert',
              targetType: 'ProjectCharacter',
              targetId: characterId,
              payload: {
                kind: 'character',
                assetId: characterId,
                appearanceId,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_character_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          characterId,
          appearanceId: appearanceId || null,
          mutationBatchId: mutationBatch.id,
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

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'generate_location_image',
          summary: `generate_location_image:${locationId}`,
          entries: [
            {
              kind: 'asset_render_revert',
              targetType: 'ProjectLocation',
              targetId: locationId,
              payload: {
                kind: 'location',
                assetId: locationId,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_location_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          locationId,
          mutationBatchId: mutationBatch.id,
        }
      },
    },
    modify_asset_image: {
      description: 'Modify an asset image (character/location) using edit model (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将修改资源图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        characterId: z.string().min(1).optional(),
        locationId: z.string().min(1).optional(),
      }).passthrough(),
      execute: async (ctx, input) => {
        const type = input.type
        const assetId = type === 'character'
          ? normalizeString((input as Record<string, unknown>).characterId)
          : normalizeString((input as Record<string, unknown>).locationId)

        if (!assetId) {
          throw new Error('PROJECT_AGENT_ASSET_ID_REQUIRED')
        }

        const body: Record<string, unknown> = {
          ...(isRecord(input) ? input : {}),
          ...(type === 'character' ? { characterId: assetId } : { locationId: assetId }),
        }
        delete body.confirmed

        const result = await submitAssetModifyTask({
          request: ctx.request,
          kind: type,
          assetId,
          body,
          access: {
            scope: 'project',
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        })

        const appearanceId = type === 'character' ? normalizeString(body.appearanceId) : ''
        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'modify_asset_image',
          summary: `modify_asset_image:${type}:${assetId}`,
          entries: [
            {
              kind: 'asset_render_revert',
              targetType: type === 'character' ? 'ProjectCharacter' : 'ProjectLocation',
              targetId: assetId,
              payload: {
                kind: type,
                assetId,
                ...(appearanceId ? { appearanceId } : {}),
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'modify_asset_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          assetId,
          mutationBatchId: mutationBatch.id,
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

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'regenerate_panel_image',
          summary: `regenerate_panel_image:${panelId}`,
          entries: [
            {
              kind: 'panel_candidate_cancel',
              targetType: 'ProjectPanel',
              targetId: panelId,
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'regenerate_panel_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          panelId,
          mutationBatchId: mutationBatch.id,
        }
      },
    },
    panel_variant: {
      description: 'Insert a variant panel after an existing panel and enqueue image generation (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将创建新的分镜格并生成变体图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        insertAfterPanelId: z.string().min(1),
        sourcePanelId: z.string().min(1),
        variant: z.record(z.unknown()),
      }).passthrough(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const storyboardId = input.storyboardId.trim()
        const insertAfterPanelId = input.insertAfterPanelId.trim()
        const sourcePanelId = input.sourcePanelId.trim()
        const variant = input.variant || {}

        const variantVideoPrompt = typeof variant.video_prompt === 'string' ? variant.video_prompt.trim() : ''
        if (!variantVideoPrompt) {
          throw new Error('PROJECT_AGENT_PANEL_VARIANT_INVALID')
        }

        const storyboard = await prisma.projectStoryboard.findUnique({
          where: { id: storyboardId },
          select: {
            id: true,
            episode: {
              select: {
                projectId: true,
              },
            },
          },
        })
        if (!storyboard || storyboard.episode.projectId !== ctx.projectId) {
          throw new Error('PROJECT_AGENT_STORYBOARD_NOT_FOUND')
        }

        const [sourcePanel, insertAfter] = await Promise.all([
          prisma.projectPanel.findUnique({ where: { id: sourcePanelId } }),
          prisma.projectPanel.findUnique({ where: { id: insertAfterPanelId } }),
        ])
        if (!sourcePanel || sourcePanel.storyboardId !== storyboardId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }
        if (!insertAfter || insertAfter.storyboardId !== storyboardId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const imageModel = projectModelConfig.storyboardModel
        const createdPanelId = createPanelVariantId()

        let billingPayload: Record<string, unknown>
        try {
          billingPayload = await buildImageBillingPayload({
            projectId: ctx.projectId,
            userId: ctx.userId,
            imageModel,
            basePayload: { ...(isRecord(input) ? input : {}), newPanelId: createdPanelId, meta: { locale } },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Image model capability not configured'
          throw new Error(message)
        }

        const createdPanel = await prisma.$transaction(async (tx) => {
          const affectedPanels = await tx.projectPanel.findMany({
            where: { storyboardId, panelIndex: { gt: insertAfter.panelIndex } },
            select: { id: true, panelIndex: true },
            orderBy: { panelIndex: 'asc' },
          })

          for (const panel of affectedPanels) {
            await tx.projectPanel.update({
              where: { id: panel.id },
              data: { panelIndex: -(panel.panelIndex + 1) },
            })
          }

          for (const panel of affectedPanels) {
            await tx.projectPanel.update({
              where: { id: panel.id },
              data: { panelIndex: panel.panelIndex + 1 },
            })
          }

          const created = await tx.projectPanel.create({
            data: {
              id: createdPanelId,
              storyboardId,
              panelIndex: insertAfter.panelIndex + 1,
              panelNumber: insertAfter.panelIndex + 2,
              shotType: typeof variant.shot_type === 'string' ? variant.shot_type : sourcePanel.shotType,
              cameraMove: typeof variant.camera_move === 'string' ? variant.camera_move : sourcePanel.cameraMove,
              description: typeof variant.description === 'string' ? variant.description : sourcePanel.description,
              videoPrompt: variantVideoPrompt,
              location: typeof variant.location === 'string' ? variant.location : sourcePanel.location,
              characters: variant.characters ? JSON.stringify(variant.characters) : sourcePanel.characters,
              srtSegment: sourcePanel.srtSegment,
              duration: sourcePanel.duration,
            },
          })

          const panelCount = await tx.projectPanel.count({
            where: { storyboardId },
          })

          await tx.projectStoryboard.update({
            where: { id: storyboardId },
            data: { panelCount },
          })

          return created
        })

        let result: Awaited<ReturnType<typeof submitTask>>
        try {
          result = await submitTask({
            userId: ctx.userId,
            locale: resolveRequiredTaskLocale(ctx.request, billingPayload),
            requestId: getRequestId(ctx.request),
            projectId: ctx.projectId,
            type: TASK_TYPE.PANEL_VARIANT,
            targetType: 'ProjectPanel',
            targetId: createdPanel.id,
            payload: billingPayload,
            dedupeKey: `panel_variant:${storyboardId}:${insertAfterPanelId}:${sourcePanelId}`,
            billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.PANEL_VARIANT, billingPayload),
          })
        } catch (error) {
          await rollbackCreatedVariantPanel({
            panelId: createdPanel.id,
            storyboardId,
            panelIndex: createdPanel.panelIndex,
          })
          throw error
        }

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'panel_variant',
          summary: `panel_variant:${createdPanel.id}`,
          entries: [
            {
              kind: 'panel_variant_delete',
              targetType: 'ProjectPanel',
              targetId: createdPanel.id,
              payload: {
                storyboardId,
                panelIndex: createdPanel.panelIndex,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'panel_variant',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return { ...result, panelId: createdPanel.id, mutationBatchId: mutationBatch.id }
      },
    },
    mutate_storyboard: {
      description: 'Apply storyboard mutations (insert panel / update prompts / reorder panels).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        requiresConfirmation: true,
        confirmationSummary: '将对分镜进行编辑/重排/插入新格子（可能删除或覆盖内容；插入可能消耗额度）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        action: z.enum(['insert_panel', 'update_panel_prompt', 'reorder_panels']),
        storyboardId: z.string().min(1),
        insertAfterPanelId: z.string().min(1).optional(),
        panelId: z.string().min(1).optional(),
        panelIndex: z.number().int().min(0).max(2000).optional(),
        userInput: z.string().optional(),
        prompt: z.string().optional(),
        videoPrompt: z.string().nullable().optional(),
        firstLastFramePrompt: z.string().nullable().optional(),
        imagePrompt: z.string().nullable().optional(),
        orderedPanelIds: z.array(z.string().min(1)).min(1).optional(),
      }).passthrough(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const storyboardId = input.storyboardId.trim()

        if (input.action === 'update_panel_prompt') {
          let panelId = normalizeString(input.panelId)
          if (!panelId) {
            if (typeof input.panelIndex !== 'number' || !Number.isFinite(input.panelIndex)) {
              throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
            }
            const panel = await prisma.projectPanel.findFirst({
              where: {
                storyboardId,
                panelIndex: input.panelIndex,
              },
              select: { id: true },
            })
            panelId = panel?.id || ''
          }
          if (!panelId) {
            throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
          }

          const before = await prisma.projectPanel.findUnique({
            where: { id: panelId },
            select: {
              id: true,
              videoPrompt: true,
              firstLastFramePrompt: true,
              imagePrompt: true,
            },
          })
          if (!before) {
            throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
          }

          const updateData: Record<string, unknown> = {}
          if (Object.prototype.hasOwnProperty.call(input, 'videoPrompt')) updateData.videoPrompt = input.videoPrompt
          if (Object.prototype.hasOwnProperty.call(input, 'firstLastFramePrompt')) updateData.firstLastFramePrompt = input.firstLastFramePrompt
          if (Object.prototype.hasOwnProperty.call(input, 'imagePrompt')) updateData.imagePrompt = input.imagePrompt
          if (Object.keys(updateData).length === 0) {
            return { success: true, panelId, noop: true }
          }

          await prisma.projectPanel.update({
            where: { id: panelId },
            data: updateData,
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: 'assistant-panel',
            operationId: 'mutate_storyboard',
            summary: `update_panel_prompt:${panelId}`,
            entries: [
              {
                kind: 'panel_prompt_restore',
                targetType: 'ProjectPanel',
                targetId: panelId,
                payload: {
                  previousVideoPrompt: before.videoPrompt,
                  previousFirstLastFramePrompt: before.firstLastFramePrompt,
                  previousImagePrompt: before.imagePrompt,
                },
              },
            ],
          })

          return { success: true, panelId, mutationBatchId: mutationBatch.id }
        }

        if (input.action === 'reorder_panels') {
          const orderedPanelIds = Array.isArray(input.orderedPanelIds)
            ? input.orderedPanelIds
              .filter((panelId: unknown): panelId is string => typeof panelId === 'string')
              .map((panelId: string) => panelId.trim())
              .filter((panelId: string) => panelId.length > 0)
            : []
          if (orderedPanelIds.length === 0) {
            throw new Error('PROJECT_AGENT_ORDER_REQUIRED')
          }

          const panels = await prisma.projectPanel.findMany({
            where: { storyboardId },
            select: { id: true, panelIndex: true, panelNumber: true },
          })

          const panelById = new Map(panels.map((panel) => [panel.id, panel] as const))
          const uniqueIds = Array.from(new Set(orderedPanelIds)) as string[]
          if (uniqueIds.length !== orderedPanelIds.length) {
            throw new Error('PROJECT_AGENT_ORDER_DUPLICATE_IDS')
          }
          if (uniqueIds.length !== panels.length) {
            throw new Error('PROJECT_AGENT_ORDER_INCOMPLETE')
          }
          for (const panelId of uniqueIds) {
            if (!panelById.has(panelId)) {
              throw new Error('PROJECT_AGENT_ORDER_INVALID_PANEL')
            }
          }

          await prisma.$transaction(async (tx) => {
            for (const panel of panels) {
              await tx.projectPanel.update({
                where: { id: panel.id },
                data: { panelIndex: -(panel.panelIndex + 1) },
              })
            }

            for (let nextIndex = 0; nextIndex < uniqueIds.length; nextIndex++) {
              const panelId = uniqueIds[nextIndex] as string
              await tx.projectPanel.update({
                where: { id: panelId },
                data: {
                  panelIndex: nextIndex,
                  panelNumber: nextIndex + 1,
                },
              })
            }
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: 'assistant-panel',
            operationId: 'mutate_storyboard',
            summary: `reorder_panels:${storyboardId}`,
            entries: [
              {
                kind: 'panel_reorder_restore',
                targetType: 'ProjectStoryboard',
                targetId: storyboardId,
                payload: {
                  storyboardId,
                  panels,
                },
              },
            ],
          })

          return { success: true, storyboardId, mutationBatchId: mutationBatch.id }
        }

        // insert_panel
        if (!input.insertAfterPanelId) {
          throw new Error('PROJECT_AGENT_INSERT_AFTER_REQUIRED')
        }
        const userInput = resolveInsertPanelUserInput(input as unknown as Record<string, unknown>, locale)
        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const billingPayload: Record<string, unknown> = {
          ...(isRecord(input) ? input : {}),
          userInput,
          ...(projectModelConfig.analysisModel ? { analysisModel: projectModelConfig.analysisModel } : {}),
          meta: {
            locale,
          },
        }
        delete billingPayload.confirmed

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, billingPayload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.INSERT_PANEL,
          targetType: 'ProjectStoryboard',
          targetId: storyboardId,
          payload: billingPayload,
          dedupeKey: `insert_panel:${storyboardId}:${input.insertAfterPanelId}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.INSERT_PANEL, billingPayload),
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'mutate_storyboard',
          summary: `insert_panel:${storyboardId}:${input.insertAfterPanelId}`,
          entries: [
            {
              kind: 'insert_panel_undo',
              targetType: 'ProjectStoryboard',
              targetId: storyboardId,
              payload: {
                taskId: result.taskId,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'mutate_storyboard',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return { ...result, storyboardId, mutationBatchId: mutationBatch.id }
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
              audioUrl: true,
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
              audioUrl: true,
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
        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'voice_generate',
          summary: `voice_generate:${episodeId}:${all ? 'all' : (lineId || 'single')}`,
          entries: voiceLines.map((line) => ({
            kind: 'voice_line_restore',
            targetType: 'ProjectVoiceLine',
            targetId: line.id,
            payload: {
              previousAudioUrl: (line as { audioUrl?: string | null }).audioUrl ?? null,
            },
          })),
        })
        if (!all) {
          writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
            operationId: 'voice_generate',
            taskId: taskIds[0] || '',
            status: results[0]?.status || 'queued',
            mutationBatchId: mutationBatch.id,
          })
          return {
            success: true,
            async: true,
            taskId: taskIds[0],
            mutationBatchId: mutationBatch.id,
          }
        }

        writeOperationDataPart<TaskBatchSubmittedPartData>(ctx.writer, 'data-task-batch-submitted', {
          operationId: 'voice_generate',
          total: taskIds.length,
          taskIds,
          results: results.map((item) => ({ refId: item.refId, taskId: item.taskId })),
          mutationBatchId: mutationBatch.id,
        })

        return {
          success: true,
          async: true,
          results: results.map((item) => ({ lineId: item.refId, taskId: item.taskId })),
          taskIds,
          total: taskIds.length,
          mutationBatchId: mutationBatch.id,
        }
      },
    },
    voice_design: {
      description: 'Design a new voice using a text prompt and preview text (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将进行音色设计（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        voicePrompt: z.string().min(1),
        previewText: z.string().min(1),
        preferredName: z.string().optional(),
        language: z.enum(['zh', 'en']).optional(),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const voicePrompt = input.voicePrompt.trim()
        const previewText = input.previewText.trim()
        const preferredName = input.preferredName?.trim() || 'custom_voice'
        const language = input.language === 'en' ? 'en' : 'zh'

        const promptValidation = validateVoicePrompt(voicePrompt)
        if (!promptValidation.valid) {
          throw new Error('PROJECT_AGENT_VOICE_PROMPT_INVALID')
        }
        const textValidation = validatePreviewText(previewText)
        if (!textValidation.valid) {
          throw new Error('PROJECT_AGENT_VOICE_PREVIEW_TEXT_INVALID')
        }

        const digest = createHash('sha1')
          .update(`${ctx.userId}:${ctx.projectId}:${voicePrompt}:${previewText}:${preferredName}:${language}`)
          .digest('hex')
          .slice(0, 16)

        const payload = {
          voicePrompt,
          previewText,
          preferredName,
          language,
          displayMode: 'detail' as const,
          meta: {
            locale,
          },
        }

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, payload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.VOICE_DESIGN,
          targetType: 'Project',
          targetId: ctx.projectId,
          payload,
          dedupeKey: `${TASK_TYPE.VOICE_DESIGN}:${digest}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_DESIGN, payload),
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'voice_design',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return result
      },
    },
    lip_sync: {
      description: 'Generate lip-sync video for a storyboard panel using a voice line (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将进行口型同步（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        panelIndex: z.number().int().min(0).max(2000),
        voiceLineId: z.string().min(1),
        lipSyncModel: z.string().optional(),
      }).passthrough(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        const requestedLipSyncModel = normalizeString((input as Record<string, unknown>).lipSyncModel)
        if (requestedLipSyncModel && !parseModelKeyStrict(requestedLipSyncModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }

        const pref = await prisma.userPreference.findUnique({
          where: { userId: ctx.userId },
          select: { lipSyncModel: true },
        })
        const preferredLipSyncModel = normalizeString(pref?.lipSyncModel)
        const resolvedLipSyncModel = requestedLipSyncModel || preferredLipSyncModel || DEFAULT_LIPSYNC_MODEL_KEY
        if (!parseModelKeyStrict(resolvedLipSyncModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }

        const storyboardId = input.storyboardId.trim()
        const panelIndex = input.panelIndex
        const voiceLineId = input.voiceLineId.trim()

        const panel = await prisma.projectPanel.findFirst({
          where: { storyboardId, panelIndex: Number(panelIndex) },
          select: { id: true, lipSyncVideoUrl: true },
        })
        if (!panel) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const payload: Record<string, unknown> = {
          ...(isRecord(input) ? input : {}),
          lipSyncModel: resolvedLipSyncModel,
          meta: {
            locale,
          },
        }
        delete payload.confirmed

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, payload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.LIP_SYNC,
          targetType: 'ProjectPanel',
          targetId: panel.id,
          payload: withTaskUiPayload(payload, {
            hasOutputAtStart: await hasPanelLipSyncOutput(panel.id),
          }),
          dedupeKey: `lip_sync:${panel.id}:${voiceLineId}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LIP_SYNC, payload),
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'lip_sync',
          summary: `lip_sync:${panel.id}:${voiceLineId}`,
          entries: [
            {
              kind: 'panel_lipsync_restore',
              targetType: 'ProjectPanel',
              targetId: panel.id,
              payload: {
                previousLipSyncVideoUrl: panel.lipSyncVideoUrl ?? null,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'lip_sync',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          panelId: panel.id,
          lipSyncModel: resolvedLipSyncModel,
          mutationBatchId: mutationBatch.id,
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
            select: { id: true, videoUrl: true },
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
          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: 'assistant-panel',
            operationId: 'generate_video',
            summary: `generate_video:${episodeId}:batch`,
            entries: panels.map((panel) => ({
              kind: 'panel_video_restore',
              targetType: 'ProjectPanel',
              targetId: panel.id,
              payload: {
                previousVideoUrl: panel.videoUrl ?? null,
              },
            })),
          })
          writeOperationDataPart<TaskBatchSubmittedPartData>(ctx.writer, 'data-task-batch-submitted', {
            operationId: 'generate_video',
            total: tasks.length,
            taskIds,
            results: panels.map((panel, index) => ({ refId: panel.id, taskId: taskIds[index] || '' })),
            mutationBatchId: mutationBatch.id,
          })

          return {
            tasks,
            total: tasks.length,
            mutationBatchId: mutationBatch.id,
          }
        }

        let panelId = normalizeString(payload.panelId)
        let previousVideoUrl: string | null = null
        if (!panelId) {
          const storyboardId = normalizeString(payload.storyboardId)
          const panelIndex = typeof payload.panelIndex === 'number' ? payload.panelIndex : NaN
          if (!storyboardId || !Number.isFinite(panelIndex)) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }
          const panel = await prisma.projectPanel.findFirst({
            where: { storyboardId, panelIndex: Number(panelIndex) },
            select: { id: true, videoUrl: true },
          })
          panelId = panel?.id || ''
          previousVideoUrl = panel?.videoUrl ?? null
        }
        if (!panelId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }
        if (normalizeString(payload.panelId)) {
          const panel = await prisma.projectPanel.findUnique({
            where: { id: panelId },
            select: { videoUrl: true },
          })
          if (!panel) {
            throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
          }
          previousVideoUrl = panel.videoUrl ?? null
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

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: 'assistant-panel',
          operationId: 'generate_video',
          summary: `generate_video:${panelId}`,
          entries: [
            {
              kind: 'panel_video_restore',
              targetType: 'ProjectPanel',
              targetId: panelId,
              payload: {
                previousVideoUrl,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_video',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          panelId,
          mutationBatchId: mutationBatch.id,
        }
      },
    },
  }
}
