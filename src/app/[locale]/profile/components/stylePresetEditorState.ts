import type {
  DirectorStyleConfig,
  StylePresetKind,
  StylePresetView,
  VisualStyleConfig,
} from '@/lib/style-preset/types'

export type DraftState = {
  id: string | null
  kind: StylePresetKind
  name: string
  summary: string
  instruction: string
  config: VisualStyleConfig | DirectorStyleConfig
}

const EMPTY_VISUAL_STYLE_CONFIG: VisualStyleConfig = {
  prompt: '',
  negativePrompt: '',
  colorPalette: [],
  lineStyle: '',
  texture: '',
  lighting: '',
  composition: '',
  detailLevel: 'medium',
}

function buildEmptyDirectorStyleConfig(): DirectorStyleConfig {
  return {
    character: {
      temperament: '',
      expression: '',
      pose: '',
      wardrobeTexture: '',
      cameraDistance: '',
      imagePrompt: '',
      avoid: '',
    },
    location: {
      spaceMood: '',
      composition: '',
      lightSource: '',
      materials: '',
      colorTemperature: '',
      depth: '',
      imagePrompt: '',
      avoid: '',
    },
    prop: {
      shapeLanguage: '',
      materialAging: '',
      placement: '',
      scale: '',
      lighting: '',
      imagePrompt: '',
      avoid: '',
    },
    storyboardPlan: {
      shotSelection: '',
      revealOrder: '',
      subjectContinuity: '',
      sceneCoverage: '',
      avoid: '',
    },
    cinematography: {
      shotSize: '',
      lens: '',
      angle: '',
      cameraHeight: '',
      depthOfField: '',
      composition: '',
      lighting: '',
      avoid: '',
    },
    acting: {
      expression: '',
      gaze: '',
      posture: '',
      gesture: '',
      motionState: '',
      interactionDistance: '',
      avoid: '',
    },
    storyboardDetail: {
      frameComposition: '',
      cameraMovement: '',
      focalPoint: '',
      foregroundBackground: '',
      transitionCue: '',
      imagePrompt: '',
      avoid: '',
    },
    image: {
      prompt: '',
      negativePrompt: '',
      lighting: '',
      color: '',
      composition: '',
      texture: '',
      atmosphere: '',
    },
    video: {
      cameraMotion: '',
      motionSpeed: '',
      subjectMotion: '',
      rhythm: '',
      stability: '',
      transition: '',
      avoid: '',
    },
  }
}

export function buildDraft(kind: StylePresetKind): DraftState {
  return {
    id: null,
    kind,
    name: '',
    summary: '',
    instruction: '',
    config: kind === 'visual_style' ? { ...EMPTY_VISUAL_STYLE_CONFIG } : buildEmptyDirectorStyleConfig(),
  }
}

export function readPresetList(value: unknown): StylePresetView[] {
  if (!value || typeof value !== 'object') return []
  const presets = (value as { presets?: unknown }).presets
  if (!Array.isArray(presets)) return []
  return presets.filter((preset): preset is StylePresetView => {
    if (!preset || typeof preset !== 'object') return false
    const record = preset as { id?: unknown; kind?: unknown; name?: unknown; config?: unknown }
    return typeof record.id === 'string'
      && (record.kind === 'visual_style' || record.kind === 'director_style')
      && typeof record.name === 'string'
      && Boolean(record.config)
  })
}

export function readDesignedPreset(value: unknown): Omit<DraftState, 'id' | 'instruction'> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    kind?: unknown
    name?: unknown
    summary?: unknown
    config?: unknown
  }
  if (record.kind !== 'visual_style' && record.kind !== 'director_style') return null
  if (typeof record.name !== 'string') return null
  return {
    kind: record.kind,
    name: record.name,
    summary: typeof record.summary === 'string' ? record.summary : '',
    config: record.config as VisualStyleConfig | DirectorStyleConfig,
  }
}
