import { z } from 'zod'
import {
  type DirectorStyleDoc,
} from '@/lib/director-style'
import {
  PRESET_SOURCES,
  STYLE_PRESET_KINDS,
  type PresetSource,
  type StylePresetKind,
  type StylePresetRef,
  type VisualStyleConfig,
} from './types'

const nonEmptyStringSchema = z.string().transform((value) => value.trim()).pipe(z.string().min(1))

export const presetSourceSchema = z.enum(PRESET_SOURCES)
export const stylePresetKindSchema = z.enum(STYLE_PRESET_KINDS)

export const stylePresetRefSchema = z.object({
  presetSource: presetSourceSchema,
  presetId: nonEmptyStringSchema,
})

export const visualStyleConfigSchema = z.object({
  prompt: nonEmptyStringSchema,
  negativePrompt: z.string(),
  colorPalette: z.array(z.string()),
  lineStyle: z.string(),
  texture: z.string(),
  lighting: z.string(),
  composition: z.string(),
  detailLevel: z.enum(['low', 'medium', 'high']),
})

export const directorStyleDocSchema = z.object({
  character: z.object({
    temperament: z.string(),
    expression: z.string(),
    pose: z.string(),
    wardrobeTexture: z.string(),
    cameraDistance: z.string(),
    imagePrompt: z.string(),
    avoid: z.string(),
  }),
  location: z.object({
    spaceMood: z.string(),
    composition: z.string(),
    lightSource: z.string(),
    materials: z.string(),
    colorTemperature: z.string(),
    depth: z.string(),
    imagePrompt: z.string(),
    avoid: z.string(),
  }),
  prop: z.object({
    shapeLanguage: z.string(),
    materialAging: z.string(),
    placement: z.string(),
    scale: z.string(),
    lighting: z.string(),
    imagePrompt: z.string(),
    avoid: z.string(),
  }),
  storyboardPlan: z.object({
    shotSelection: z.string(),
    revealOrder: z.string(),
    subjectContinuity: z.string(),
    sceneCoverage: z.string(),
    avoid: z.string(),
  }),
  cinematography: z.object({
    shotSize: z.string(),
    lens: z.string(),
    angle: z.string(),
    cameraHeight: z.string(),
    depthOfField: z.string(),
    composition: z.string(),
    lighting: z.string(),
    avoid: z.string(),
  }),
  acting: z.object({
    expression: z.string(),
    gaze: z.string(),
    posture: z.string(),
    gesture: z.string(),
    motionState: z.string(),
    interactionDistance: z.string(),
    avoid: z.string(),
  }),
  storyboardDetail: z.object({
    frameComposition: z.string(),
    cameraMovement: z.string(),
    focalPoint: z.string(),
    foregroundBackground: z.string(),
    transitionCue: z.string(),
    imagePrompt: z.string(),
    avoid: z.string(),
  }),
  image: z.object({
    prompt: z.string(),
    negativePrompt: z.string(),
    lighting: z.string(),
    color: z.string(),
    composition: z.string(),
    texture: z.string(),
    atmosphere: z.string(),
  }),
  video: z.object({
    cameraMotion: z.string(),
    motionSpeed: z.string(),
    subjectMotion: z.string(),
    rhythm: z.string(),
    stability: z.string(),
    transition: z.string(),
    avoid: z.string(),
  }),
})

export function isPresetSource(value: unknown): value is PresetSource {
  return presetSourceSchema.safeParse(value).success
}

export function isStylePresetKind(value: unknown): value is StylePresetKind {
  return stylePresetKindSchema.safeParse(value).success
}

export function parseStylePresetRef(value: unknown): StylePresetRef {
  return stylePresetRefSchema.parse(value)
}

export function parseVisualStyleConfig(value: unknown): VisualStyleConfig {
  return visualStyleConfigSchema.parse(value)
}

export function parseDirectorStyleConfig(value: unknown): DirectorStyleDoc {
  return directorStyleDocSchema.parse(value)
}

export function parseStylePresetConfig(kind: StylePresetKind, value: unknown): VisualStyleConfig | DirectorStyleDoc {
  return kind === 'visual_style'
    ? parseVisualStyleConfig(value)
    : parseDirectorStyleConfig(value)
}

export function parseStoredStylePresetConfig(kind: StylePresetKind, raw: string): VisualStyleConfig | DirectorStyleDoc {
  const parsed = JSON.parse(raw) as unknown
  return parseStylePresetConfig(kind, parsed)
}
