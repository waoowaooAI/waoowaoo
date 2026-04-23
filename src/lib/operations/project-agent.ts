import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { submitAssetGenerateTask, submitAssetModifyTask } from '@/lib/assets/services/asset-actions'
import { createReadOperations } from './domains/project/read-ops'
import { createPlanOperations } from './domains/workflow/plan-ops'
import { createGovernanceOperations } from './domains/governance/governance-ops'
import { createEditOperations } from './domains/storyboard/edit-ops'
import { createStoryboardPanelEditOperations } from './domains/storyboard/panel-edit-ops'
import { createGuiOperations } from './domains/gui/gui-ops'
import { createExtraOperations } from './domains/extra/extra-ops'
import { createLlmTaskOperations } from './domains/llm/llm-task-ops'
import { createMediaOperations } from './domains/media/media-ops'
import { createConfigOperations } from './domains/config/config-ops'
import { createProjectDataOperations } from './domains/project/project-data-ops'
import { createProjectCrudOperations } from './domains/project/project-crud-ops'
import { createSystemProjectOperations } from './domains/project/system-project-ops'
import { createVideoOperations } from './domains/media/video-ops'
import { createDownloadOperations } from './domains/media/download-ops'
import { createRunOperations } from './domains/run/run-ops'
import { createTaskOperations } from './domains/task/task-ops'
import { createSseOperations } from './domains/debug/sse-ops'
import { createHomeLlmOperations } from './domains/llm/home-llm-ops'
import { createAssetHubLlmOperations } from './domains/asset-hub/asset-hub-llm-ops'
import { createAssetHubVoiceOperations } from './domains/asset-hub/asset-hub-voice-ops'
import { createAssetHubFolderOperations } from './domains/asset-hub/asset-hub-folder-ops'
import { createAssetHubVoiceLibraryOperations } from './domains/asset-hub/asset-hub-voice-library-ops'
import { createAssetHubVoiceUploadOperations } from './domains/asset-hub/asset-hub-voice-upload-ops'
import { createAssetHubCharacterLibraryOperations } from './domains/asset-hub/asset-hub-character-library-ops'
import { createAssetHubCharacterAppearanceOperations } from './domains/asset-hub/asset-hub-character-appearance-ops'
import { createAssetHubLocationLibraryOperations } from './domains/asset-hub/asset-hub-location-library-ops'
import { createAssetHubPickerOperations } from './domains/asset-hub/asset-hub-picker-ops'
import { createUserPreferenceOperations } from './domains/config/user-preference-ops'
import { createUserModelsOperations } from './domains/config/user-models-ops'
import { createUserBillingOperations } from './domains/billing/user-billing-ops'
import { createUserApiConfigOperations } from './domains/config/user-api-config-ops'
import { createAuthOperations } from './domains/auth/auth-ops'
import { createAlwaysOnOperations } from './domains/ui/always-on-ops'
import { withOperationPack } from './pack'
import { definePackedOperation } from './define-operation'
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
import type {
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationContext, ProjectAgentOperationRegistry, ProjectAgentOperationRegistryDraft } from './types'
import { writeOperationDataPart } from './types'


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

const modifyCharacterImageInputSchema = z.object({
  confirmed: z.boolean().optional(),
  characterId: z.string().min(1),
}).passthrough()

const modifyLocationImageInputSchema = z.object({
  confirmed: z.boolean().optional(),
  locationId: z.string().min(1),
}).passthrough()

const generateVoiceLineAudioInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  lineId: z.string().min(1),
  audioModel: z.string().optional(),
})

const generateEpisodeVoiceAudioInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  audioModel: z.string().optional(),
})

const generatePanelVideoInputSchema = z.object({
  confirmed: z.boolean().optional(),
  panelId: z.string().min(1).optional(),
  storyboardId: z.string().min(1).optional(),
  panelIndex: z.number().int().min(0).max(2000).optional(),
  videoModel: z.string().min(1),
  firstLastFrame: z.unknown().optional(),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough().refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
  message: 'panelId or (storyboardId + panelIndex) is required',
  path: ['panelId'],
})

const generateEpisodeVideosInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
  videoModel: z.string().min(1),
  firstLastFrame: z.unknown().optional(),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

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

async function executeAssetImageModificationOperation(params: {
  ctx: ProjectAgentOperationContext
  input: Record<string, unknown>
  operationId: string
  kind: 'character' | 'location'
}) {
  const assetId = params.kind === 'character'
    ? normalizeString(params.input.characterId)
    : normalizeString(params.input.locationId)

  if (!assetId) {
    throw new Error('PROJECT_AGENT_ASSET_ID_REQUIRED')
  }

  const body: Record<string, unknown> = {
    ...params.input,
    ...(params.kind === 'character' ? { characterId: assetId } : { locationId: assetId }),
  }
  delete body.confirmed

  const result = await submitAssetModifyTask({
    request: params.ctx.request,
    kind: params.kind,
    assetId,
    body,
    access: {
      scope: 'project',
      userId: params.ctx.userId,
      projectId: params.ctx.projectId,
    },
  })

  const appearanceId = params.kind === 'character' ? normalizeString(body.appearanceId) : ''
  const mutationBatch = await createMutationBatch({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    summary: `${params.operationId}:${assetId}`,
    entries: [
      {
        kind: 'asset_render_revert',
        targetType: params.kind === 'character' ? 'ProjectCharacter' : 'ProjectLocation',
        targetId: assetId,
        payload: {
          kind: params.kind,
          assetId,
          ...(appearanceId ? { appearanceId } : {}),
        },
      },
    ],
  })

  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
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
}

async function executeVoiceGenerateOperation(params: {
  ctx: ProjectAgentOperationContext
  input: {
    episodeId?: string
    lineId?: string
    audioModel?: string
  }
  operationId: string
  all: boolean
}) {
  const locale = resolveLocaleFromContext(params.ctx.context.locale)
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  const lineId = normalizeString(params.input.lineId)
  const requestedAudioModel = normalizeString(params.input.audioModel)

  if (!episodeId) {
    throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  }
  if (!params.all && !lineId) {
    throw new Error('PROJECT_AGENT_VOICE_LINE_REQUIRED')
  }
  if (requestedAudioModel && !parseModelKeyStrict(requestedAudioModel)) {
    throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
  }

  const [pref, projectData, episode] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: params.ctx.userId },
      select: { audioModel: true },
    }),
    prisma.project.findUnique({
      where: { id: params.ctx.projectId },
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
        projectId: params.ctx.projectId,
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
    params.ctx.userId,
    resolvedAudioModel || null,
    'audio',
  )
  const selectedProviderKey = getProviderKey(selectedResolvedAudioModel.provider).toLowerCase()

  const speakerVoices = parseSpeakerVoiceMap(episode.speakerVoices)
  const characters = (projectData.characters || []) as CharacterRow[]

  let voiceLines: VoiceLineRow[] = []
  if (params.all) {
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

  const localeForTask = resolveRequiredTaskLocale(params.ctx.request, { meta: { locale } })
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
        userId: params.ctx.userId,
        locale: localeForTask,
        requestId: getRequestId(params.ctx.request),
        projectId: params.ctx.projectId,
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
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    summary: `${params.operationId}:${episodeId}:${params.all ? 'all' : (lineId || 'single')}`,
    entries: voiceLines.map((line) => ({
      kind: 'voice_line_restore',
      targetType: 'ProjectVoiceLine',
      targetId: line.id,
      payload: {
        previousAudioUrl: (line as { audioUrl?: string | null }).audioUrl ?? null,
      },
    })),
  })
  if (!params.all) {
    writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
      operationId: params.operationId,
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

  writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
    operationId: params.operationId,
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
}

async function executeGenerateVideoOperation(params: {
  ctx: ProjectAgentOperationContext
  input: Record<string, unknown>
  operationId: string
  batch: boolean
}) {
  const locale = resolveLocaleFromContext(params.ctx.context.locale)
  const existingMeta = isRecord(params.input.meta) ? params.input.meta : {}
  const payload: Record<string, unknown> = {
    ...params.input,
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
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
  })

  const localeForTask = resolveRequiredTaskLocale(params.ctx.request, payload)
  if (params.batch) {
    const episodeId = normalizeString(payload.episodeId) || normalizeString(params.ctx.context.episodeId)
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
          userId: params.ctx.userId,
          locale: localeForTask,
          requestId: getRequestId(params.ctx.request),
          projectId: params.ctx.projectId,
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
      projectId: params.ctx.projectId,
      userId: params.ctx.userId,
      source: params.ctx.source,
      operationId: params.operationId,
      summary: `${params.operationId}:${episodeId}:batch`,
      entries: panels.map((panel) => ({
        kind: 'panel_video_restore',
        targetType: 'ProjectPanel',
        targetId: panel.id,
        payload: {
          previousVideoUrl: panel.videoUrl ?? null,
        },
      })),
    })
    writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
      operationId: params.operationId,
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
    userId: params.ctx.userId,
    locale: localeForTask,
    requestId: getRequestId(params.ctx.request),
    projectId: params.ctx.projectId,
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
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    summary: `${params.operationId}:${panelId}`,
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

  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
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
  const CONFIRM_NONE = { required: false, summary: null, budget: null } as const
  const CHANNELS_TOOL_API = { tool: true, api: true } as const
  const CHANNELS_API_ONLY = { tool: false, api: true } as const
  const CHANNELS_TOOL_ONLY = { tool: true, api: false } as const
  const PREREQ_EPISODE_OPTIONAL = { episodeId: 'optional' } as const
  const PREREQ_EPISODE_REQUIRED = { episodeId: 'required' } as const

  return {
    ...withOperationPack(createAlwaysOnOperations(), {
      groupPath: ['ui'],
      channels: CHANNELS_TOOL_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createSystemProjectOperations(), {
      groupPath: ['project', 'system'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createRunOperations(), {
      groupPath: ['run'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createTaskOperations(), {
      groupPath: ['task'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createSseOperations(), {
      groupPath: ['debug', 'sse'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createHomeLlmOperations(), {
      groupPath: ['llm'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAuthOperations(), {
      groupPath: ['auth'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserPreferenceOperations(), {
      groupPath: ['config', 'preference'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserModelsOperations(), {
      groupPath: ['config', 'models'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserBillingOperations(), {
      groupPath: ['billing'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserApiConfigOperations(), {
      groupPath: ['config', 'api'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubLlmOperations(), {
      groupPath: ['asset-hub', 'ai'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubVoiceOperations(), {
      groupPath: ['asset-hub', 'voice'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubFolderOperations(), {
      groupPath: ['asset-hub', 'folder'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubVoiceLibraryOperations(), {
      groupPath: ['asset-hub', 'voice-library'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubVoiceUploadOperations(), {
      groupPath: ['asset-hub', 'voice-upload'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubCharacterLibraryOperations(), {
      groupPath: ['asset-hub', 'character-library'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubCharacterAppearanceOperations(), {
      groupPath: ['asset-hub', 'character-appearance'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubLocationLibraryOperations(), {
      groupPath: ['asset-hub', 'location-library'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubPickerOperations(), {
      groupPath: ['asset-hub', 'picker'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createReadOperations(), {
      groupPath: ['project', 'read'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createProjectCrudOperations(), {
      groupPath: ['project', 'crud'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createVideoOperations(), {
      groupPath: ['media', 'video'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createDownloadOperations(), {
      groupPath: ['media', 'download'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createPlanOperations(), {
      groupPath: ['workflow', 'plan'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createGovernanceOperations(), {
      groupPath: ['governance'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack({
      ...createEditOperations(),
      ...createStoryboardPanelEditOperations(),
    }, {
      groupPath: ['storyboard', 'edit'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createConfigOperations(), {
      groupPath: ['config'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createProjectDataOperations(), {
      groupPath: ['project', 'data'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createGuiOperations(), {
      groupPath: ['gui'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createExtraOperations(), {
      groupPath: ['extra'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createLlmTaskOperations(), {
      groupPath: ['llm', 'task'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createMediaOperations(), {
      groupPath: ['media'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    generate_character_image: definePackedOperation({
      id: 'generate_character_image',
      summary: 'Generate character appearance images for a project character.',
      intent: 'act',
      groupPath: ['asset', 'character'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为角色生成形象图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
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
    }),
    generate_location_image: definePackedOperation({
      id: 'generate_location_image',
      summary: 'Generate location images for a project location.',
      intent: 'act',
      groupPath: ['asset', 'location'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为场景生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
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
    }),
    modify_asset_image: definePackedOperation({
      id: 'modify_asset_image',
      summary: 'Modify an asset image (character/location) using edit model (async task submission).',
      intent: 'act',
      groupPath: ['asset', 'edit'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改资源图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        characterId: z.string().min(1).optional(),
        locationId: z.string().min(1).optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeAssetImageModificationOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'modify_asset_image',
        kind: input.type,
      }),
    }),
    modify_character_image: definePackedOperation({
      id: 'modify_character_image',
      summary: 'Modify a project character image using the edit model.',
      intent: 'act',
      groupPath: ['asset', 'character'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改角色图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: modifyCharacterImageInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeAssetImageModificationOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'modify_character_image',
        kind: 'character',
      }),
    }),
    modify_location_image: definePackedOperation({
      id: 'modify_location_image',
      summary: 'Modify a project location image using the edit model.',
      intent: 'act',
      groupPath: ['asset', 'location'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改场景图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: modifyLocationImageInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeAssetImageModificationOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'modify_location_image',
        kind: 'location',
      }),
    }),
    regenerate_panel_image: definePackedOperation({
      id: 'regenerate_panel_image',
      summary: 'Regenerate storyboard panel images (async task submission).',
      intent: 'act',
      groupPath: ['storyboard', 'edit'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为分镜格子重新生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
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
    }),
    panel_variant: definePackedOperation({
      id: 'panel_variant',
      summary: 'Insert a variant panel after an existing panel and enqueue image generation (async task submission).',
      intent: 'act',
      groupPath: ['storyboard', 'edit'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将创建新的分镜格并生成变体图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
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
    }),
    voice_generate: definePackedOperation({
      id: 'voice_generate',
      summary: 'Generate voice line audio for one or more voice lines (async task submission).',
      intent: 'act',
      groupPath: ['voice'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_REQUIRED,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: CONFIRM_NONE,
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1).optional(),
        lineId: z.string().min(1).optional(),
        all: z.boolean().optional(),
        audioModel: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeVoiceGenerateOperation({
        ctx,
        input,
        operationId: 'voice_generate',
        all: input.all === true,
      }),
    }),
    generate_voice_line_audio: definePackedOperation({
      id: 'generate_voice_line_audio',
      summary: 'Generate audio for a single voice line.',
      intent: 'act',
      groupPath: ['voice'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_REQUIRED,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为单条台词生成配音（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateVoiceLineAudioInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeVoiceGenerateOperation({
        ctx,
        input,
        operationId: 'generate_voice_line_audio',
        all: false,
      }),
    }),
    generate_episode_voice_audio: definePackedOperation({
      id: 'generate_episode_voice_audio',
      summary: 'Generate audio for all pending voice lines in an episode.',
      intent: 'act',
      groupPath: ['voice'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_REQUIRED,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为整集待生成台词批量生成配音（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeVoiceAudioInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeVoiceGenerateOperation({
        ctx,
        input,
        operationId: 'generate_episode_voice_audio',
        all: true,
      }),
    }),
    voice_design: definePackedOperation({
      id: 'voice_design',
      summary: 'Design a new voice using a text prompt and preview text (async task submission).',
      intent: 'act',
      groupPath: ['voice'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将进行音色设计（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
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
    }),
    lip_sync: definePackedOperation({
      id: 'lip_sync',
      summary: 'Generate lip-sync video for a storyboard panel using a voice line (async task submission).',
      intent: 'act',
      groupPath: ['media', 'lipsync'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将进行口型同步（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
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
    }),
    generate_video: definePackedOperation({
      id: 'generate_video',
      summary: 'Generate panel videos for a storyboard panel or an episode batch (async task submission).',
      intent: 'act',
      groupPath: ['media', 'video'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: CONFIRM_NONE,
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
      execute: async (ctx, input) => executeGenerateVideoOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'generate_video',
        batch: input.all === true,
      }),
    }),
    generate_panel_video: definePackedOperation({
      id: 'generate_panel_video',
      summary: 'Generate video for a single storyboard panel.',
      intent: 'act',
      groupPath: ['media', 'video'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为单个分镜格生成视频（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generatePanelVideoInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeGenerateVideoOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'generate_panel_video',
        batch: false,
      }),
    }),
    generate_episode_videos: definePackedOperation({
      id: 'generate_episode_videos',
      summary: 'Batch generate videos for pending panels in an episode.',
      intent: 'act',
      groupPath: ['media', 'video'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_REQUIRED,
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为整集待生成分镜批量生成视频（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeVideosInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => executeGenerateVideoOperation({
        ctx,
        input: { ...input, all: true } as Record<string, unknown>,
        operationId: 'generate_episode_videos',
        batch: true,
      }),
    }),
  }
}
