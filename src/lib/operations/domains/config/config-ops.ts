import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logProjectAction } from '@/lib/logging/semantic'
import { ApiError } from '@/lib/api-errors'
import { isArtStyleValue } from '@/lib/constants'
import { resolveDirectorStyleFieldsFromPreset } from '@/lib/director-style'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { buildProjectReadModel } from '@/lib/projects/build-project-read-model'
import {
  type CapabilitySelections,
  type UnifiedModelType,
} from '@/lib/ai-registry/types'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { resolveBuiltinModelContext, getCapabilityOptionFields, validateCapabilitySelectionsPayload, type CapabilityModelContext } from '@/lib/ai-registry/capabilities-catalog'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'

const MODEL_FIELDS = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
] as const

const MODEL_FIELD_TO_TYPE: Record<typeof MODEL_FIELDS[number], UnifiedModelType> = {
  analysisModel: 'llm',
  characterModel: 'image',
  locationModel: 'image',
  storyboardModel: 'image',
  editModel: 'image',
  videoModel: 'video',
  audioModel: 'audio',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCapabilitySelectionsInput(
  raw: unknown,
  options?: { allowLegacyAspectRatio?: boolean },
): CapabilitySelections {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field: 'capabilityOverrides',
    })
  }

  const normalized: CapabilitySelections = {}
  for (const [modelKey, rawSelection] of Object.entries(raw)) {
    if (!isRecord(rawSelection)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'CAPABILITY_SELECTION_INVALID',
        field: `capabilityOverrides.${modelKey}`,
      })
    }

    const selection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (field === 'aspectRatio') {
        if (options?.allowLegacyAspectRatio) continue
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_FIELD_INVALID',
          field: `capabilityOverrides.${modelKey}.${field}`,
        })
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_SELECTION_INVALID',
          field: `capabilityOverrides.${modelKey}.${field}`,
        })
      }
      selection[field] = value
    }

    if (Object.keys(selection).length > 0) {
      normalized[modelKey] = selection
    }
  }

  return normalized
}

function parseStoredCapabilitySelections(raw: string | null | undefined): CapabilitySelections {
  if (!raw) return {}
  try {
    return normalizeCapabilitySelectionsInput(JSON.parse(raw) as unknown, { allowLegacyAspectRatio: true })
  } catch {
    return {}
  }
}

function serializeCapabilitySelections(selections: CapabilitySelections): string | null {
  if (Object.keys(selections).length === 0) return null
  return JSON.stringify(selections)
}

function validateModelKeyField(field: typeof MODEL_FIELDS[number], value: unknown) {
  if (value === null) return
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field,
    })
  }
  if (!parseModelKeyStrict(value)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field,
    })
  }
}

function validateArtStyleField(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  const artStyle = value.trim()
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  return artStyle
}

function resolveCapabilityContext(
  modelKey: string,
  modelContextMap: Record<string, CapabilityModelContext>,
): CapabilityModelContext | null {
  return modelContextMap[modelKey] || null
}

function getNextProjectModelMap(
  current: {
    analysisModel: string | null
    characterModel: string | null
    locationModel: string | null
    storyboardModel: string | null
    editModel: string | null
    videoModel: string | null
    audioModel: string | null
  },
  updates: Record<string, unknown>,
): Record<string, CapabilityModelContext> {
  const nextMap = new Map<string, CapabilityModelContext>()

  for (const field of MODEL_FIELDS) {
    const rawValue = updates[field] !== undefined
      ? updates[field]
      : current[field]
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue

    const modelKey = rawValue.trim()
    const context = resolveBuiltinModelContext(MODEL_FIELD_TO_TYPE[field], modelKey)
    if (!context) continue
    nextMap.set(modelKey, context)
  }

  return Object.fromEntries(nextMap.entries())
}

function sanitizeCapabilityOverrides(
  overrides: CapabilitySelections,
  modelContextMap: Record<string, CapabilityModelContext>,
): CapabilitySelections {
  const sanitized: CapabilitySelections = {}

  for (const [modelKey, selection] of Object.entries(overrides)) {
    const context = resolveCapabilityContext(modelKey, modelContextMap)
    if (!context) continue

    const optionFields = getCapabilityOptionFields(context.modelType, context.capabilities)
    if (Object.keys(optionFields).length === 0) continue

    const cleanedSelection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(selection)) {
      const allowedValues = optionFields[field]
      if (!allowedValues) continue
      if (!allowedValues.includes(value)) continue
      cleanedSelection[field] = value
    }

    if (Object.keys(cleanedSelection).length > 0) {
      sanitized[modelKey] = cleanedSelection
    }
  }

  return sanitized
}

function validateCapabilityOverrides(
  overrides: CapabilitySelections,
  modelContextMap: Record<string, CapabilityModelContext>,
) {
  const issues = validateCapabilitySelectionsPayload(overrides, (modelKey) =>
    resolveCapabilityContext(modelKey, modelContextMap))

  if (issues.length > 0) {
    const firstIssue = issues[0]
    throw new ApiError('INVALID_PARAMS', {
      code: firstIssue.code,
      field: firstIssue.field,
      allowedValues: firstIssue.allowedValues,
    })
  }
}

export function createConfigOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_project_config: {
      id: 'get_project_config',
      summary: 'Get project model and capability override configuration (sanitized).',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}),
      outputSchema: z.object({
        capabilityOverrides: z.record(z.record(z.union([z.string(), z.number(), z.boolean()]))),
        directorStylePresetId: z.string().nullable(),
        directorStyleDoc: z.string().nullable(),
      }),
      execute: async (ctx) => {
        const projectData = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          select: {
            capabilityOverrides: true,
            directorStylePresetId: true,
            directorStyleDoc: true,
            analysisModel: true,
            characterModel: true,
            locationModel: true,
            storyboardModel: true,
            editModel: true,
            videoModel: true,
            audioModel: true,
          },
        })

        const storedOverrides = parseStoredCapabilitySelections(projectData?.capabilityOverrides)
        const modelContextMap = projectData
          ? getNextProjectModelMap({
              analysisModel: projectData.analysisModel,
              characterModel: projectData.characterModel,
              locationModel: projectData.locationModel,
              storyboardModel: projectData.storyboardModel,
              editModel: projectData.editModel,
              videoModel: projectData.videoModel,
              audioModel: projectData.audioModel,
            }, {})
          : {}
        const cleanedOverrides = sanitizeCapabilityOverrides(storedOverrides, modelContextMap)

        return {
          capabilityOverrides: cleanedOverrides,
          directorStylePresetId: projectData?.directorStylePresetId ?? null,
          directorStyleDoc: projectData?.directorStyleDoc ?? null,
        }
      },
    },

    update_project_config: {
      id: 'update_project_config',
      summary: 'Update project model keys, artStyle, and capability overrides.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: { required: true },
      inputSchema: z.object({
        analysisModel: z.string().nullable().optional(),
        characterModel: z.string().nullable().optional(),
        locationModel: z.string().nullable().optional(),
        storyboardModel: z.string().nullable().optional(),
        editModel: z.string().nullable().optional(),
        videoModel: z.string().nullable().optional(),
        audioModel: z.string().nullable().optional(),
        videoRatio: z.string().optional(),
        artStyle: z.string().optional(),
        directorStylePresetId: z.string().nullable().optional(),
        capabilityOverrides: z.unknown().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>

        const currentProjectConfig = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          select: {
            id: true,
            name: true,
            analysisModel: true,
            characterModel: true,
            locationModel: true,
            storyboardModel: true,
            editModel: true,
            videoModel: true,
            audioModel: true,
          },
        })
        if (!currentProjectConfig) {
          throw new ApiError('NOT_FOUND')
        }

        const allowedProjectFields = [
          ...MODEL_FIELDS,
          'videoRatio',
          'artStyle',
          'directorStylePresetId',
          'capabilityOverrides',
        ] as const

        const updateData: Record<string, unknown> = {}
        for (const field of allowedProjectFields) {
          if (body[field] === undefined) continue

          if ((MODEL_FIELDS as readonly string[]).includes(field)) {
            validateModelKeyField(field as typeof MODEL_FIELDS[number], body[field])
          }

          if (field === 'artStyle') {
            updateData[field] = validateArtStyleField(body[field])
            continue
          }

          if (field === 'capabilityOverrides') {
            const overrides = normalizeCapabilitySelectionsInput(body.capabilityOverrides)
            const modelContextMap = getNextProjectModelMap(currentProjectConfig, body)
            const cleanedOverrides = sanitizeCapabilityOverrides(overrides, modelContextMap)
            validateCapabilityOverrides(cleanedOverrides, modelContextMap)
            updateData.capabilityOverrides = serializeCapabilitySelections(cleanedOverrides)
            continue
          }

          if (field === 'directorStylePresetId') {
            try {
              const styleFields = resolveDirectorStyleFieldsFromPreset(body.directorStylePresetId)
              updateData.directorStylePresetId = styleFields.directorStylePresetId
              updateData.directorStyleDoc = styleFields.directorStyleDoc
            } catch {
              throw new ApiError('INVALID_PARAMS', {
                code: 'INVALID_DIRECTOR_STYLE_PRESET',
                field: 'directorStylePresetId',
                message: 'directorStylePresetId must be a supported value',
              })
            }
            continue
          }

          updateData[field] = body[field]
        }

        const updatedProject = await prisma.project.update({
          where: { id: ctx.projectId },
          data: updateData,
        })

        const projectWithSignedUrls = await attachMediaFieldsToProject(updatedProject)
        const fullProject = buildProjectReadModel(updatedProject, projectWithSignedUrls)

        logProjectAction(
          'UPDATE_NOVEL_PROMOTION',
          ctx.userId,
          null,
          ctx.projectId,
          currentProjectConfig.name,
          { changes: body },
        )

        return { project: fullProject }
      },
    },
  }
}
