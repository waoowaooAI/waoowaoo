import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { safeParseJsonObject } from '@/lib/json-repair'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { withTextBilling } from '@/lib/billing'
import { getUserModelConfig } from '@/lib/config-service'
import { buildAiPrompt, AI_PROMPT_IDS } from '@/lib/ai-prompts'
import type { Locale } from '@/i18n/routing'
import {
  parseStylePresetConfig,
  parseStoredStylePresetConfig,
  stylePresetKindSchema,
} from './schema'
import type {
  StylePresetKind,
  StylePresetRecord,
  StylePresetView,
} from './types'

interface StylePresetDb {
  userStylePreset: {
    findMany(args: Record<string, unknown>): Promise<StylePresetRecord[]>
    findFirst(args: Record<string, unknown>): Promise<StylePresetRecord | null>
    create(args: Record<string, unknown>): Promise<StylePresetRecord>
    update(args: Record<string, unknown>): Promise<StylePresetRecord>
  }
}

const db = prisma as unknown as StylePresetDb

const createPresetInputSchema = z.object({
  kind: stylePresetKindSchema,
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(500).nullable().optional(),
  config: z.unknown(),
})

const updatePresetInputSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  config: z.unknown().optional(),
})

const designPresetInputSchema = z.object({
  kind: stylePresetKindSchema,
  instruction: z.string().trim().min(1).max(4000),
})

function toView(record: StylePresetRecord): StylePresetView {
  if (!stylePresetKindSchema.safeParse(record.kind).success) {
    throw new Error(`USER_STYLE_PRESET_KIND_INVALID:${record.kind}`)
  }
  const kind = record.kind as StylePresetKind
  return {
    id: record.id,
    kind,
    name: record.name,
    summary: record.summary,
    config: parseStoredStylePresetConfig(kind, record.config),
    version: record.version,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toApiInvalidParams(error: unknown, field: string): ApiError {
  const message = error instanceof Error ? error.message : 'invalid style preset payload'
  return new ApiError('INVALID_PARAMS', {
    code: 'STYLE_PRESET_INVALID',
    field,
    message,
  })
}

async function requireOwnedPreset(userId: string, presetId: string): Promise<StylePresetRecord> {
  const preset = await db.userStylePreset.findFirst({
    where: {
      id: presetId,
      userId,
      archivedAt: null,
    },
  })
  if (!preset) {
    throw new ApiError('NOT_FOUND', {
      code: 'STYLE_PRESET_NOT_FOUND',
      field: 'presetId',
    })
  }
  return preset
}

export async function listUserStylePresets(params: {
  userId: string
  kind?: StylePresetKind
}): Promise<{ presets: StylePresetView[] }> {
  const presets = await db.userStylePreset.findMany({
    where: {
      userId: params.userId,
      archivedAt: null,
      ...(params.kind ? { kind: params.kind } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  })
  return { presets: presets.map(toView) }
}

export async function createUserStylePreset(params: {
  userId: string
  input: unknown
}): Promise<{ preset: StylePresetView }> {
  const parsed = createPresetInputSchema.safeParse(params.input)
  if (!parsed.success) throw toApiInvalidParams(parsed.error, 'body')
  const { kind, name, summary } = parsed.data
  let config: unknown
  try {
    config = parseStylePresetConfig(kind, parsed.data.config)
  } catch (error) {
    throw toApiInvalidParams(error, 'config')
  }

  const preset = await db.userStylePreset.create({
    data: {
      userId: params.userId,
      kind,
      name,
      summary: summary || null,
      config: JSON.stringify(config),
    },
  })
  return { preset: toView(preset) }
}

export async function updateUserStylePreset(params: {
  userId: string
  presetId: string
  input: unknown
}): Promise<{ preset: StylePresetView }> {
  const current = await requireOwnedPreset(params.userId, params.presetId)
  const parsed = updatePresetInputSchema.safeParse(params.input)
  if (!parsed.success) throw toApiInvalidParams(parsed.error, 'body')

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.summary !== undefined) data.summary = parsed.data.summary || null
  if (parsed.data.config !== undefined) {
    let config: unknown
    try {
      config = parseStylePresetConfig(current.kind as StylePresetKind, parsed.data.config)
    } catch (error) {
      throw toApiInvalidParams(error, 'config')
    }
    data.config = JSON.stringify(config)
    data.version = current.version + 1
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STYLE_PRESET_UPDATE_EMPTY',
      field: 'body',
    })
  }

  const preset = await db.userStylePreset.update({
    where: { id: current.id },
    data,
  })
  return { preset: toView(preset) }
}

export async function archiveUserStylePreset(params: {
  userId: string
  presetId: string
}): Promise<{ preset: StylePresetView }> {
  const current = await requireOwnedPreset(params.userId, params.presetId)
  const preset = await db.userStylePreset.update({
    where: { id: current.id },
    data: {
      archivedAt: new Date(),
      version: current.version + 1,
    },
  })
  return { preset: toView(preset) }
}

export async function designUserStylePreset(params: {
  userId: string
  locale: Locale
  input: unknown
}): Promise<{
  kind: StylePresetKind
  name: string
  summary: string
  config: StylePresetView['config']
}> {
  const parsed = designPresetInputSchema.safeParse(params.input)
  if (!parsed.success) throw toApiInvalidParams(parsed.error, 'body')

  const userConfig = await getUserModelConfig(params.userId)
  if (!userConfig.analysisModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'ANALYSIS_MODEL_REQUIRED',
      field: 'analysisModel',
      message: 'analysis model is required before designing style presets',
    })
  }
  const analysisModel = userConfig.analysisModel

  const prompt = buildAiPrompt({
    promptId: parsed.data.kind === 'visual_style'
      ? AI_PROMPT_IDS.DESIGN_VISUAL_STYLE_PRESET
      : AI_PROMPT_IDS.DESIGN_DIRECTOR_STYLE_PRESET,
    locale: params.locale,
    variables: {
      instruction: parsed.data.instruction,
    },
  })

  const action = parsed.data.kind === 'visual_style'
    ? 'design_visual_style_preset'
    : 'design_director_style_preset'
  const completion = await withTextBilling(
    params.userId,
    analysisModel,
    Math.max(1200, Math.ceil(prompt.length * 1.2)),
    2000,
    { projectId: 'user-style-presets', action, metadata: { kind: parsed.data.kind } },
    async () =>
      await executeAiTextStep({
        userId: params.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        action,
        meta: {
          stepId: action,
          stepTitle: action,
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )

  if (!completion.text.trim()) {
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'STYLE_PRESET_DESIGN_EMPTY',
      message: 'AI returned empty style preset design',
    })
  }

  const output = safeParseJsonObject(completion.text)
  const name = typeof output.name === 'string' && output.name.trim() ? output.name.trim() : ''
  const summary = typeof output.summary === 'string' ? output.summary.trim() : ''
  if (!name) {
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'STYLE_PRESET_DESIGN_NAME_MISSING',
      field: 'name',
      message: 'AI style preset design must include name',
    })
  }

  let config: StylePresetView['config']
  try {
    config = parseStylePresetConfig(parsed.data.kind, output.config)
  } catch (error) {
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'STYLE_PRESET_DESIGN_CONFIG_INVALID',
      field: 'config',
      message: error instanceof Error ? error.message : 'AI style preset config is invalid',
    })
  }

  return {
    kind: parsed.data.kind,
    name,
    summary,
    config,
  }
}
