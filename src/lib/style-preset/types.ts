import type { DirectorStyleDoc } from '@/lib/director-style'

export const PRESET_SOURCES = ['system', 'user'] as const
export type PresetSource = (typeof PRESET_SOURCES)[number]

export const STYLE_PRESET_KINDS = ['visual_style', 'director_style'] as const
export type StylePresetKind = (typeof STYLE_PRESET_KINDS)[number]

export interface StylePresetRef {
  presetSource: PresetSource
  presetId: string
}

export interface VisualStyleConfig {
  prompt: string
  negativePrompt: string
  colorPalette: string[]
  lineStyle: string
  texture: string
  lighting: string
  composition: string
  detailLevel: 'low' | 'medium' | 'high'
}

export type DirectorStyleConfig = DirectorStyleDoc

export type UserStylePresetConfig =
  | { kind: 'visual_style'; config: VisualStyleConfig }
  | { kind: 'director_style'; config: DirectorStyleDoc }

export interface StylePresetRecord {
  id: string
  userId: string
  kind: StylePresetKind
  name: string
  summary: string | null
  config: string
  version: number
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface StylePresetView {
  id: string
  kind: StylePresetKind
  name: string
  summary: string | null
  config: VisualStyleConfig | DirectorStyleDoc
  version: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ResolvedVisualStylePreset {
  source: PresetSource
  presetId: string
  name: string
  prompt: string
  negativePrompt: string
  config: VisualStyleConfig
}
