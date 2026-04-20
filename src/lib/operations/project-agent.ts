import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { submitAssetGenerateTask, submitAssetModifyTask } from '@/lib/assets/services/asset-actions'
import { createReadOperations } from './read-ops'
import { createPlanOperations } from './plan-ops'
import { createGovernanceOperations } from './governance-ops'
import { createEditOperations } from './edit-ops'
import { createGuiOperations } from './gui-ops'
import { createExtraOperations } from './extra-ops'
import { createLlmTaskOperations } from './llm-task-ops'
import { createMediaOperations } from './media-ops'
import { createConfigOperations } from './config-ops'
import { createProjectDataOperations } from './project-data-ops'
import { createProjectCrudOperations } from './project-crud-ops'
import { createSystemProjectOperations } from './system-project-ops'
import { createVideoOperations } from './video-ops'
import { createDownloadOperations } from './download-ops'
import { createRunOperations } from './run-ops'
import { createTaskOperations } from './task-ops'
import { createSseOperations } from './sse-ops'
import { createHomeLlmOperations } from './home-llm-ops'
import { createAssetHubLlmOperations } from './asset-hub-llm-ops'
import { createAssetHubVoiceOperations } from './asset-hub-voice-ops'
import { createHash, randomUUID } from 'crypto'
import { ApiError, getRequestId } from '@/lib/api-errors'
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
import { createMutationBatch } from '@/lib/mutation-batch/service'
import { resolveInsertPanelUserInput } from '@/lib/project-workflow/insert-panel'
import { serializeStructuredJsonField } from '@/lib/project-workflow/panel-ai-data-sync'
import type {
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistry } from './types'
import { writeOperationDataPart } from './types'
import { getSignedUrl, generateUniqueKey, downloadAndUploadImage, toFetchableUrl } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'


const DEFAULT_LIPSYNC_MODEL_KEY = composeModelKey('fal', 'fal-ai/kling-video/lipsync/audio-to-video')

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseNullableNumberField(value: unknown): number | null {
  if (value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error('INVALID_PARAMS')
}

function toStructuredJsonField(value: unknown, fieldName: string): string | null {
  try {
    return serializeStructuredJsonField(value, fieldName)
  } catch (error) {
    const message = error instanceof Error ? error.message : `${fieldName} must be valid JSON`
    throw new Error(message || 'INVALID_PARAMS')
  }
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

type PanelHistoryEntry = {
  url: string
  timestamp: string
}

function parseUnknownArray(jsonValue: string | null): unknown[] {
  if (!jsonValue) return []
  try {
    const parsed = JSON.parse(jsonValue)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parsePanelHistory(jsonValue: string | null): PanelHistoryEntry[] {
  return parseUnknownArray(jsonValue).filter((entry): entry is PanelHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as { url?: unknown; timestamp?: unknown }
    return typeof candidate.url === 'string' && typeof candidate.timestamp === 'string'
  })
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

function hasUploadedReferenceAudioForSpeaker(params: {
  speaker: string
  characters: CharacterRow[]
  speakerVoices: SpeakerVoiceMap
}): boolean {
  const character = matchCharacterBySpeaker(params.speaker, params.characters)
  if (normalizeString(character?.customVoiceUrl)) return true
  const entry = params.speakerVoices[params.speaker]
  if (entry?.provider === 'fal' && normalizeString(entry.audioUrl)) return true
  return false
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
    ...createSystemProjectOperations(),
    ...createRunOperations(),
    ...createTaskOperations(),
    ...createSseOperations(),
    ...createHomeLlmOperations(),
    ...createAssetHubLlmOperations(),
    ...createAssetHubVoiceOperations(),
    ...createReadOperations(),
    ...createProjectCrudOperations(),
    ...createVideoOperations(),
    ...createDownloadOperations(),
    ...createPlanOperations(),
    ...createGovernanceOperations(),
    ...createEditOperations(),
    ...createConfigOperations(),
    ...createProjectDataOperations(),
    ...createGuiOperations(),
    ...createExtraOperations(),
    ...createLlmTaskOperations(),
    ...createMediaOperations(),
    generate_character_image: {
      id: 'generate_character_image',
      description: 'Generate character appearance images for a project character.',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        longRunning: true,
        confirmationSummary: '将为角色生成形象图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'asset',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1).optional(),
        characterName: z.string().min(1).optional(),
        appearanceId: z.string().min(1).optional(),
        appearanceIndex: z.number().int().min(0).max(20).optional(),
        count: z.number().int().positive().max(6).optional(),
        imageIndex: z.number().int().min(0).max(20).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.characterId || value.characterName), {
        message: 'characterId or characterName is required',
        path: ['characterId'],
      }),
      outputSchema: z.unknown(),
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
          source: ctx.source,
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
      id: 'generate_location_image',
      description: 'Generate location images for a project location.',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        longRunning: true,
        confirmationSummary: '将为场景生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'asset',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1).optional(),
        locationName: z.string().min(1).optional(),
        count: z.number().int().positive().max(6).optional(),
        imageIndex: z.number().int().min(0).max(50).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.locationId || value.locationName), {
        message: 'locationId or locationName is required',
        path: ['locationId'],
      }),
      outputSchema: z.unknown(),
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
          source: ctx.source,
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
      id: 'modify_asset_image',
      description: 'Modify an asset image (character/location) using edit model (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        overwrite: true,
        destructive: true,
        longRunning: true,
        confirmationSummary: '将修改资源图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'asset',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        characterId: z.string().min(1).optional(),
        locationId: z.string().min(1).optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
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
          source: ctx.source,
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
      id: 'regenerate_panel_image',
      description: 'Regenerate storyboard panel images (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        longRunning: true,
        confirmationSummary: '将为分镜格子重新生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'panel',
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
      outputSchema: z.unknown(),
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
          source: ctx.source,
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
      id: 'panel_variant',
      description: 'Insert a variant panel after an existing panel and enqueue image generation (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        longRunning: true,
        confirmationSummary: '将创建新的分镜格并生成变体图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'storyboard',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        insertAfterPanelId: z.string().min(1),
        sourcePanelId: z.string().min(1),
        variant: z.record(z.unknown()),
      }).passthrough(),
      outputSchema: z.unknown(),
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
          source: ctx.source,
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
      id: 'mutate_storyboard',
      description: 'Apply storyboard mutations (insert panel / update prompts / reorder panels).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        requiresConfirmation: true,
        overwrite: true,
        bulk: true,
        destructive: true,
        confirmationSummary: '将对分镜进行编辑/重排/插入新格子（可能删除或覆盖内容；插入可能消耗额度）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'storyboard',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        action: z.enum([
          'insert_panel',
          'update_panel_prompt',
          'reorder_panels',
          'create_panel',
          'select_panel_candidate',
          'cancel_panel_candidates',
          'delete_panel',
          'update_panel_fields',
        ]),
        storyboardId: z.string().min(1),
        insertAfterPanelId: z.string().min(1).optional(),
        panelId: z.string().min(1).optional(),
        panelIndex: z.number().int().min(0).max(2000).optional(),
        panelNumber: z.unknown().optional(),
        shotType: z.string().nullable().optional(),
        cameraMove: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        characters: z.string().nullable().optional(),
        props: z.string().nullable().optional(),
        srtStart: z.unknown().optional(),
        srtEnd: z.unknown().optional(),
        duration: z.unknown().optional(),
        linkedToNextPanel: z.unknown().optional(),
        userInput: z.string().optional(),
        prompt: z.string().optional(),
        videoPrompt: z.string().nullable().optional(),
        firstLastFramePrompt: z.string().nullable().optional(),
        imagePrompt: z.string().nullable().optional(),
        selectedImageUrl: z.string().optional(),
        actingNotes: z.unknown().optional(),
        photographyRules: z.unknown().optional(),
        orderedPanelIds: z.array(z.string().min(1)).min(1).optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const storyboardId = input.storyboardId.trim()

        if (input.action === 'select_panel_candidate' || input.action === 'cancel_panel_candidates') {
          const panelId = normalizeString(input.panelId)
          if (!panelId) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }

          const panel = await prisma.projectPanel.findFirst({
            where: {
              id: panelId,
              storyboard: {
                episode: {
                  projectId: ctx.projectId,
                },
              },
            },
            select: {
              id: true,
              imageUrl: true,
              imageHistory: true,
              candidateImages: true,
            },
          })
          if (!panel) {
            throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
          }

          if (input.action === 'cancel_panel_candidates') {
            const previousCandidateImages = panel.candidateImages
            await prisma.projectPanel.update({
              where: { id: panelId },
              data: { candidateImages: null },
            })

            const mutationBatch = await createMutationBatch({
              projectId: ctx.projectId,
              userId: ctx.userId,
              source: ctx.source,
              operationId: 'mutate_storyboard',
              summary: `cancel_panel_candidates:${panelId}`,
              entries: [
                {
                  kind: 'panel_candidates_restore',
                  targetType: 'ProjectPanel',
                  targetId: panelId,
                  payload: {
                    previousCandidateImages,
                  },
                },
              ],
            })

            return { success: true, panelId, mutationBatchId: mutationBatch.id }
          }

          const selectedImageUrl = normalizeString(input.selectedImageUrl)
          if (!selectedImageUrl) {
            throw new Error('PROJECT_AGENT_SELECTED_IMAGE_REQUIRED')
          }

          const candidateImages = parseUnknownArray(panel.candidateImages)
          const selectedCosKey = await resolveStorageKeyFromMediaValue(selectedImageUrl)
          const candidateKeys = (await Promise.all(
            candidateImages.map((candidate: unknown) => resolveStorageKeyFromMediaValue(candidate)),
          )).filter((key): key is string => !!key)

          if (!selectedCosKey || !candidateKeys.includes(selectedCosKey)) {
            throw new Error('PROJECT_AGENT_PANEL_CANDIDATE_INVALID')
          }

          const currentHistory = parsePanelHistory(panel.imageHistory)
          if (panel.imageUrl) {
            currentHistory.push({
              url: panel.imageUrl,
              timestamp: new Date().toISOString(),
            })
          }

          let finalImageKey = selectedCosKey
          const isReusableKey = !finalImageKey.startsWith('http://')
            && !finalImageKey.startsWith('https://')
            && !finalImageKey.startsWith('/')

          if (!isReusableKey) {
            const sourceUrl = toFetchableUrl(selectedImageUrl)
            const cosKey = generateUniqueKey(`panel-${panelId}-selected`, 'png')
            finalImageKey = await downloadAndUploadImage(sourceUrl, cosKey)
          }

          const signedUrl = getSignedUrl(finalImageKey, 7 * 24 * 3600)
          const previousCandidateImages = panel.candidateImages
          const previousImageUrl = panel.imageUrl
          const previousImageHistory = panel.imageHistory

          await prisma.projectPanel.update({
            where: { id: panelId },
            data: {
              imageUrl: finalImageKey,
              imageHistory: JSON.stringify(currentHistory),
              candidateImages: null,
            },
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: ctx.source,
            operationId: 'mutate_storyboard',
            summary: `select_panel_candidate:${panelId}`,
            entries: [
              {
                kind: 'panel_candidate_select_restore',
                targetType: 'ProjectPanel',
                targetId: panelId,
                payload: {
                  previousImageUrl,
                  previousImageHistory,
                  previousCandidateImages,
                },
              },
            ],
          })

          return {
            success: true,
            panelId,
            imageUrl: signedUrl,
            cosKey: finalImageKey,
            mutationBatchId: mutationBatch.id,
          }
        }

        const storyboard = await prisma.projectStoryboard.findFirst({
          where: {
            id: storyboardId,
            episode: {
              projectId: ctx.projectId,
            },
          },
          select: { id: true },
        })
        if (!storyboard) {
          throw new Error('PROJECT_AGENT_STORYBOARD_NOT_FOUND')
        }

        if (input.action === 'create_panel') {
          const createdPanel = await prisma.$transaction(async (tx) => {
            const maxPanel = await tx.projectPanel.findFirst({
              where: { storyboardId },
              orderBy: { panelIndex: 'desc' },
              select: { panelIndex: true },
            })
            const nextPanelIndex = (maxPanel?.panelIndex ?? -1) + 1

            const hasSrtStart = Object.prototype.hasOwnProperty.call(input, 'srtStart')
            const hasSrtEnd = Object.prototype.hasOwnProperty.call(input, 'srtEnd')
            const hasDuration = Object.prototype.hasOwnProperty.call(input, 'duration')

            const panel = await tx.projectPanel.create({
              data: {
                storyboardId,
                panelIndex: nextPanelIndex,
                panelNumber: nextPanelIndex + 1,
                shotType: input.shotType ?? null,
                cameraMove: input.cameraMove ?? null,
                description: input.description ?? null,
                location: input.location ?? null,
                characters: input.characters ?? null,
                props: input.props ?? null,
                ...(hasSrtStart ? { srtStart: parseNullableNumberField(input.srtStart) } : {}),
                ...(hasSrtEnd ? { srtEnd: parseNullableNumberField(input.srtEnd) } : {}),
                ...(hasDuration ? { duration: parseNullableNumberField(input.duration) } : {}),
                ...(Object.prototype.hasOwnProperty.call(input, 'videoPrompt') ? { videoPrompt: input.videoPrompt } : {}),
                ...(Object.prototype.hasOwnProperty.call(input, 'firstLastFramePrompt') ? { firstLastFramePrompt: input.firstLastFramePrompt } : {}),
              },
            })

            const panelCount = await tx.projectPanel.count({
              where: { storyboardId },
            })

            await tx.projectStoryboard.update({
              where: { id: storyboardId },
              data: { panelCount },
            })

            return panel
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: ctx.source,
            operationId: 'mutate_storyboard',
            summary: `create_panel:${createdPanel.id}`,
            entries: [
              {
                kind: 'panel_create_delete',
                targetType: 'ProjectPanel',
                targetId: createdPanel.id,
                payload: {
                  storyboardId,
                  panelIndex: createdPanel.panelIndex,
                },
              },
            ],
          })

          return {
            success: true,
            panel: createdPanel,
            panelId: createdPanel.id,
            storyboardId,
            mutationBatchId: mutationBatch.id,
          }
        }

        if (input.action === 'delete_panel') {
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

          const panel = await prisma.projectPanel.findFirst({
            where: { id: panelId, storyboardId },
            select: {
              id: true,
              storyboardId: true,
              panelIndex: true,
              panelNumber: true,
              shotType: true,
              cameraMove: true,
              description: true,
              location: true,
              characters: true,
              props: true,
              srtSegment: true,
              srtStart: true,
              srtEnd: true,
              duration: true,
              imagePrompt: true,
              imageUrl: true,
              imageMediaId: true,
              imageHistory: true,
              videoPrompt: true,
              firstLastFramePrompt: true,
              videoUrl: true,
              videoGenerationMode: true,
              videoMediaId: true,
              sceneType: true,
              candidateImages: true,
              linkedToNextPanel: true,
              lipSyncTaskId: true,
              lipSyncVideoUrl: true,
              lipSyncVideoMediaId: true,
              sketchImageUrl: true,
              sketchImageMediaId: true,
              photographyRules: true,
              actingNotes: true,
              previousImageUrl: true,
              previousImageMediaId: true,
            },
          })
          if (!panel) {
            throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
          }

          await prisma.$transaction(async (tx) => {
            await tx.projectPanel.delete({
              where: { id: panelId },
            })

            const maxPanel = await tx.projectPanel.findFirst({
              where: { storyboardId },
              orderBy: { panelIndex: 'desc' },
              select: { panelIndex: true },
            })
            const maxPanelIndex = maxPanel?.panelIndex ?? -1
            const offset = maxPanelIndex + 1000

            await tx.projectPanel.updateMany({
              where: {
                storyboardId,
                panelIndex: { gt: panel.panelIndex },
              },
              data: {
                panelIndex: { increment: offset },
                panelNumber: { increment: offset },
              },
            })

            await tx.projectPanel.updateMany({
              where: {
                storyboardId,
                panelIndex: { gt: panel.panelIndex + offset },
              },
              data: {
                panelIndex: { decrement: offset + 1 },
                panelNumber: { decrement: offset + 1 },
              },
            })

            const panelCount = await tx.projectPanel.count({
              where: { storyboardId },
            })
            await tx.projectStoryboard.update({
              where: { id: storyboardId },
              data: { panelCount },
            })
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: ctx.source,
            operationId: 'mutate_storyboard',
            summary: `delete_panel:${panelId}`,
            entries: [
              {
                kind: 'panel_delete_restore',
                targetType: 'ProjectStoryboard',
                targetId: storyboardId,
                payload: {
                  panel,
                },
              },
            ],
          })

          return { success: true, panelId, storyboardId, mutationBatchId: mutationBatch.id }
        }

        if (input.action === 'update_panel_fields') {
          let panelId = normalizeString(input.panelId)
          const panelIndex = typeof input.panelIndex === 'number' && Number.isFinite(input.panelIndex)
            ? input.panelIndex
            : null

          const updateData: Record<string, unknown> = {}
          if (Object.prototype.hasOwnProperty.call(input, 'panelNumber')) {
            const parsed = parseNullableNumberField(input.panelNumber)
            updateData.panelNumber = parsed === null ? null : Math.trunc(parsed)
          }
          if (Object.prototype.hasOwnProperty.call(input, 'shotType')) updateData.shotType = input.shotType
          if (Object.prototype.hasOwnProperty.call(input, 'cameraMove')) updateData.cameraMove = input.cameraMove
          if (Object.prototype.hasOwnProperty.call(input, 'description')) updateData.description = input.description
          if (Object.prototype.hasOwnProperty.call(input, 'location')) updateData.location = input.location
          if (Object.prototype.hasOwnProperty.call(input, 'characters')) updateData.characters = input.characters
          if (Object.prototype.hasOwnProperty.call(input, 'props')) updateData.props = input.props
          if (Object.prototype.hasOwnProperty.call(input, 'srtStart')) updateData.srtStart = parseNullableNumberField(input.srtStart)
          if (Object.prototype.hasOwnProperty.call(input, 'srtEnd')) updateData.srtEnd = parseNullableNumberField(input.srtEnd)
          if (Object.prototype.hasOwnProperty.call(input, 'duration')) updateData.duration = parseNullableNumberField(input.duration)
          if (Object.prototype.hasOwnProperty.call(input, 'videoPrompt')) updateData.videoPrompt = input.videoPrompt
          if (Object.prototype.hasOwnProperty.call(input, 'firstLastFramePrompt')) updateData.firstLastFramePrompt = input.firstLastFramePrompt
          if (Object.prototype.hasOwnProperty.call(input, 'linkedToNextPanel')) {
            updateData.linkedToNextPanel = input.linkedToNextPanel === true
          }
          if (Object.prototype.hasOwnProperty.call(input, 'actingNotes')) updateData.actingNotes = toStructuredJsonField(input.actingNotes, 'actingNotes')
          if (Object.prototype.hasOwnProperty.call(input, 'photographyRules')) updateData.photographyRules = toStructuredJsonField(input.photographyRules, 'photographyRules')

          if (Object.keys(updateData).length === 0) {
            return { success: true, panelId: panelId || null, noop: true }
          }

              const existing = panelId
            ? await prisma.projectPanel.findFirst({
                where: { id: panelId, storyboardId },
                select: {
                  id: true,
                  panelIndex: true,
                  panelNumber: true,
                  shotType: true,
                  cameraMove: true,
                  description: true,
                  location: true,
                  characters: true,
                  props: true,
                  srtStart: true,
                  srtEnd: true,
                  duration: true,
                  videoPrompt: true,
                  firstLastFramePrompt: true,
                  linkedToNextPanel: true,
                  actingNotes: true,
                  photographyRules: true,
                },
              })
            : panelIndex === null
              ? null
              : await prisma.projectPanel.findUnique({
                  where: {
                    storyboardId_panelIndex: {
                      storyboardId,
                      panelIndex,
                    },
                  },
                  select: {
                    id: true,
                    panelIndex: true,
                    panelNumber: true,
                    shotType: true,
                    cameraMove: true,
                    description: true,
                    location: true,
                    characters: true,
                    props: true,
                    srtStart: true,
                    srtEnd: true,
                    duration: true,
                    videoPrompt: true,
                    firstLastFramePrompt: true,
                    linkedToNextPanel: true,
                    actingNotes: true,
                    photographyRules: true,
                  },
                })

          if (existing) {
            panelId = existing.id
            await prisma.projectPanel.update({
              where: { id: existing.id },
              data: updateData,
            })

            const mutationBatch = await createMutationBatch({
              projectId: ctx.projectId,
              userId: ctx.userId,
              source: ctx.source,
              operationId: 'mutate_storyboard',
              summary: `update_panel_fields:${existing.id}`,
              entries: [
                {
                  kind: 'panel_fields_restore',
                  targetType: 'ProjectPanel',
                  targetId: existing.id,
                  payload: {
                    previous: existing,
                  },
                },
              ],
            })

            return { success: true, panelId: existing.id, storyboardId, mutationBatchId: mutationBatch.id }
          }

          if (panelIndex === null) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }

          const createdPanel = await prisma.projectPanel.create({
            data: {
              storyboardId,
              panelIndex,
              panelNumber: panelIndex + 1,
              imageUrl: null,
              ...updateData,
            },
            select: { id: true, panelIndex: true },
          })

          const panelCount = await prisma.projectPanel.count({
            where: { storyboardId },
          })
          await prisma.projectStoryboard.update({
            where: { id: storyboardId },
            data: { panelCount },
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: ctx.source,
            operationId: 'mutate_storyboard',
            summary: `create_panel:${createdPanel.id}`,
            entries: [
              {
                kind: 'panel_create_delete',
                targetType: 'ProjectPanel',
                targetId: createdPanel.id,
                payload: {
                  storyboardId,
                  panelIndex: createdPanel.panelIndex,
                },
              },
            ],
          })

          return { success: true, panelId: createdPanel.id, storyboardId, created: true, mutationBatchId: mutationBatch.id }
        }

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

          const updateData: Record<string, unknown> = {}
          if (Object.prototype.hasOwnProperty.call(input, 'videoPrompt')) updateData.videoPrompt = input.videoPrompt
          if (Object.prototype.hasOwnProperty.call(input, 'firstLastFramePrompt')) updateData.firstLastFramePrompt = input.firstLastFramePrompt
          if (Object.prototype.hasOwnProperty.call(input, 'imagePrompt')) updateData.imagePrompt = input.imagePrompt
          if (Object.keys(updateData).length === 0) {
            return { success: true, panelId, noop: true }
          }

          if (!panelId) {
            if (typeof input.panelIndex !== 'number' || !Number.isFinite(input.panelIndex)) {
              throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
            }

            const createdPanel = await prisma.projectPanel.create({
              data: {
                storyboardId,
                panelIndex: input.panelIndex,
                panelNumber: input.panelIndex + 1,
                imageUrl: null,
                ...updateData,
              },
              select: { id: true, panelIndex: true },
            })

            const panelCount = await prisma.projectPanel.count({
              where: { storyboardId },
            })
            await prisma.projectStoryboard.update({
              where: { id: storyboardId },
              data: { panelCount },
            })

            const mutationBatch = await createMutationBatch({
              projectId: ctx.projectId,
              userId: ctx.userId,
              source: ctx.source,
              operationId: 'mutate_storyboard',
              summary: `create_panel:${createdPanel.id}`,
              entries: [
                {
                  kind: 'panel_create_delete',
                  targetType: 'ProjectPanel',
                  targetId: createdPanel.id,
                  payload: {
                    storyboardId,
                    panelIndex: createdPanel.panelIndex,
                  },
                },
              ],
            })

            return { success: true, panelId: createdPanel.id, created: true, mutationBatchId: mutationBatch.id }
          }

          const before = await prisma.projectPanel.findFirst({
            where: { id: panelId, storyboardId },
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

          await prisma.projectPanel.update({
            where: { id: panelId },
            data: updateData,
          })

          const mutationBatch = await createMutationBatch({
            projectId: ctx.projectId,
            userId: ctx.userId,
            source: ctx.source,
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
            source: ctx.source,
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
          source: ctx.source,
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
      id: 'voice_generate',
      description: 'Generate voice line audio for one or more voice lines (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        bulk: true,
        longRunning: true,
        confirmationSummary: '将生成配音（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'episode',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1).optional(),
        lineId: z.string().min(1).optional(),
        all: z.boolean().optional(),
        audioModel: z.string().optional(),
      }),
      outputSchema: z.unknown(),
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
            // Bailian/Qwen TTS requires a voiceId binding; uploaded reference audio alone is not sufficient.
            if (selectedProviderKey === 'bailian' && hasUploadedReferenceAudioForSpeaker({ speaker: line.speaker, characters, speakerVoices })) {
              throw new ApiError('INVALID_PARAMS', {
                message: '无音色ID，QwenTTS 必须使用 AI 设计音色',
              })
            }
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
          source: ctx.source,
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
      id: 'voice_design',
      description: 'Design a new voice using a text prompt and preview text (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将进行音色设计（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'project',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        voicePrompt: z.string().min(1),
        previewText: z.string().min(1),
        preferredName: z.string().optional(),
        language: z.enum(['zh', 'en']).optional(),
      }),
      outputSchema: z.unknown(),
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
      id: 'lip_sync',
      description: 'Generate lip-sync video for a storyboard panel using a voice line (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        overwrite: true,
        longRunning: true,
        confirmationSummary: '将进行口型同步（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'panel',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        panelIndex: z.number().int().min(0).max(2000),
        voiceLineId: z.string().min(1),
        lipSyncModel: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
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
          source: ctx.source,
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
      id: 'generate_video',
      description: 'Generate panel videos for a storyboard panel or an episode batch (async task submission).',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        overwrite: true,
        bulk: true,
        longRunning: true,
        confirmationSummary: '将生成视频（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'episode',
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
      outputSchema: z.unknown(),
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
            source: ctx.source,
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
          source: ctx.source,
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
