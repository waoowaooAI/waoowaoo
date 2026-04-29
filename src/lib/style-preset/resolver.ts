import { prisma } from '@/lib/prisma'
import { parseDirectorStyleDoc, type DirectorStyleDoc } from '@/lib/director-style'
import {
  buildSystemDirectorStyleConfig,
  buildSystemVisualStyleConfig,
  isSystemDirectorStylePresetId,
  isSystemVisualStylePresetId,
} from './system'
import { isPresetSource, parseStoredStylePresetConfig } from './schema'
import type { PresetSource, ResolvedVisualStylePreset, StylePresetKind, VisualStyleConfig } from './types'

interface UserStylePresetDbRecord {
  id: string
  userId: string
  kind: string
  name: string
  summary: string | null
  config: string
  archivedAt: Date | null
}

interface StylePresetResolverDb {
  userStylePreset: {
    findFirst(args: Record<string, unknown>): Promise<UserStylePresetDbRecord | null>
  }
  project: {
    findUnique(args: Record<string, unknown>): Promise<{
      artStyle?: string | null
      directorStylePresetId?: string | null
      directorStyleDoc?: string | null
      visualStylePresetSource?: string | null
      visualStylePresetId?: string | null
      directorStylePresetSource?: string | null
    } | null>
  }
}

const db = prisma as unknown as StylePresetResolverDb

function normalizeSource(value: unknown): PresetSource | null {
  return isPresetSource(value) ? value : null
}

async function loadUserPreset(params: {
  userId: string
  presetId: string
  kind: StylePresetKind
}): Promise<UserStylePresetDbRecord> {
  const preset = await db.userStylePreset.findFirst({
    where: {
      id: params.presetId,
      userId: params.userId,
      kind: params.kind,
      archivedAt: null,
    },
  })
  if (!preset) {
    throw new Error(`USER_STYLE_PRESET_NOT_FOUND:${params.kind}:${params.presetId}`)
  }
  return preset
}

export async function resolveVisualStylePreset(params: {
  userId: string
  presetSource: PresetSource
  presetId: string
  locale: 'zh' | 'en'
}): Promise<ResolvedVisualStylePreset> {
  if (params.presetSource === 'system') {
    if (!isSystemVisualStylePresetId(params.presetId)) {
      throw new Error(`VISUAL_STYLE_PRESET_INVALID:${params.presetId}`)
    }
    const config = buildSystemVisualStyleConfig(params.presetId, params.locale)
    return {
      source: 'system',
      presetId: params.presetId,
      name: params.presetId,
      prompt: config.prompt,
      negativePrompt: config.negativePrompt,
      config,
    }
  }

  const preset = await loadUserPreset({
    userId: params.userId,
    presetId: params.presetId,
    kind: 'visual_style',
  })
  const config = parseStoredStylePresetConfig('visual_style', preset.config) as VisualStyleConfig
  return {
    source: 'user',
    presetId: preset.id,
    name: preset.name,
    prompt: config.prompt,
    negativePrompt: config.negativePrompt,
    config,
  }
}

export async function resolveProjectVisualStylePreset(params: {
  projectId: string
  userId: string
  locale: 'zh' | 'en'
}): Promise<ResolvedVisualStylePreset> {
  const project = await db.project.findUnique({
    where: { id: params.projectId },
    select: {
      artStyle: true,
      visualStylePresetSource: true,
      visualStylePresetId: true,
    },
  })
  if (!project) throw new Error('Project not found')

  const presetSource = normalizeSource(project.visualStylePresetSource)
  if (!presetSource) throw new Error(`VISUAL_STYLE_PRESET_SOURCE_INVALID:${String(project.visualStylePresetSource)}`)
  const presetId = typeof project.visualStylePresetId === 'string' ? project.visualStylePresetId.trim() : ''
  if (!presetId) throw new Error('VISUAL_STYLE_PRESET_ID_MISSING')

  return resolveVisualStylePreset({
    userId: params.userId,
    presetSource,
    presetId,
    locale: params.locale,
  })
}

export async function resolveDirectorStylePreset(params: {
  userId: string
  presetSource: PresetSource
  presetId: string
}): Promise<DirectorStyleDoc> {
  if (params.presetSource === 'system') {
    if (!isSystemDirectorStylePresetId(params.presetId)) {
      throw new Error(`DIRECTOR_STYLE_PRESET_INVALID:${params.presetId}`)
    }
    return buildSystemDirectorStyleConfig(params.presetId)
  }

  const preset = await loadUserPreset({
    userId: params.userId,
    presetId: params.presetId,
    kind: 'director_style',
  })
  return parseStoredStylePresetConfig('director_style', preset.config) as DirectorStyleDoc
}

export async function resolveProjectDirectorStyleDoc(params: {
  projectId: string
  userId: string
}): Promise<DirectorStyleDoc | null> {
  const project = await db.project.findUnique({
    where: { id: params.projectId },
    select: {
      directorStylePresetSource: true,
      directorStylePresetId: true,
      directorStyleDoc: true,
    },
  })
  if (!project) throw new Error('Project not found')

  const sourceValue = project.directorStylePresetSource
  const presetId = typeof project.directorStylePresetId === 'string' ? project.directorStylePresetId.trim() : ''
  if ((sourceValue !== null && sourceValue !== undefined) || presetId) {
    const source = normalizeSource(sourceValue)
    if (!source) throw new Error(`DIRECTOR_STYLE_PRESET_SOURCE_INVALID:${String(sourceValue)}`)
    if (!presetId) throw new Error('DIRECTOR_STYLE_PRESET_ID_MISSING')
    return resolveDirectorStylePreset({
      userId: params.userId,
      presetSource: source,
      presetId,
    })
  }

  return parseDirectorStyleDoc(project.directorStyleDoc)
}
