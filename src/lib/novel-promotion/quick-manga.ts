import {
  evaluateLayoutIntelligence,
  type LayoutIntelligenceDecision,
} from '@/lib/novel-promotion/layout-intelligence'

export type QuickMangaPreset = 'auto' | 'action-battle' | 'romance-drama' | 'slice-of-life' | 'comedy-4koma'

export type QuickMangaLayout = 'auto' | 'cinematic' | 'four-koma' | 'vertical-scroll' | 'splash-focus'

export type QuickMangaColorMode = 'auto' | 'full-color' | 'black-white' | 'limited-palette'

export interface QuickMangaOptions {
  enabled: boolean
  preset: QuickMangaPreset
  layout: QuickMangaLayout
  colorMode: QuickMangaColorMode
}

const PRESET_DIRECTIVE_LABEL: Record<QuickMangaPreset, string> = {
  auto: 'Auto',
  'action-battle': 'Action / Battle',
  'romance-drama': 'Romance / Drama',
  'slice-of-life': 'Slice of Life',
  'comedy-4koma': 'Comedy 4-koma',
}

const LAYOUT_DIRECTIVE_LABEL: Record<Exclude<QuickMangaLayout, 'auto'>, string> = {
  cinematic: 'Cinematic Panels',
  'four-koma': '4-koma Rhythm',
  'vertical-scroll': 'Vertical Scroll',
  'splash-focus': 'Splash Focus',
}

const COLOR_MODE_DIRECTIVE_LABEL: Record<QuickMangaColorMode, string> = {
  auto: 'Auto',
  'full-color': 'Full Color',
  'black-white': 'Black & White',
  'limited-palette': 'Limited Palette',
}

function resolveLayoutLabel(layout: QuickMangaLayout | Exclude<QuickMangaLayout, 'auto'>): string {
  if (layout === 'auto') return 'Auto'
  return LAYOUT_DIRECTIVE_LABEL[layout]
}

function buildLayoutIntelligenceBlock(decision: LayoutIntelligenceDecision) {
  return [
    '[LAYOUT_INTELLIGENCE_V1]',
    `Recommended Profile: ${decision.recommendedProfile}`,
    `Recommended Layout: ${resolveLayoutLabel(decision.recommendedLayout)}`,
    `Chosen Profile: ${decision.chosenProfile}`,
    `Chosen Layout: ${resolveLayoutLabel(decision.chosenLayout)}`,
    `Decision Source: ${decision.decisionSource}`,
    `Confidence: ${decision.confidence}`,
    `Reasons: ${decision.reasons.length ? decision.reasons.join(' | ') : 'n/a'}`,
    `Debug Trace: ${JSON.stringify(decision.debugTrace)}`,
  ].join('\n')
}

function buildQuickMangaDirective(params: {
  content: string
  options: QuickMangaOptions
  artStyle?: string | null
  phase: 'story-input' | 'storyboard-refine'
}) {
  const styleLabel = params.artStyle?.trim() ? params.artStyle.trim() : 'auto'

  const layoutDecision = evaluateLayoutIntelligence({
    content: params.content,
    preset: params.options.preset,
    manualLayout: params.options.layout,
  })

  const phaseGuideline = params.phase === 'storyboard-refine'
    ? 'Guideline: enforce panel rhythm and shot clarity while preserving narrative continuity.'
    : 'Guideline: keep plot intact, optimize for panel-ready beats and concise scene transitions.'

  return [
    '[QUICK_MANGA_ENTRY]',
    `Preset: ${PRESET_DIRECTIVE_LABEL[params.options.preset]}`,
    `Panel Layout Input: ${resolveLayoutLabel(params.options.layout)}`,
    `Panel Layout Resolved: ${resolveLayoutLabel(layoutDecision.chosenLayout)}`,
    `Color Mode: ${COLOR_MODE_DIRECTIVE_LABEL[params.options.colorMode]}`,
    `Visual Style: ${styleLabel}`,
    phaseGuideline,
    'Guideline: preserve dialogue intent and character continuity across panels.',
    buildLayoutIntelligenceBlock(layoutDecision),
  ].join('\n')
}

export function buildQuickMangaStoryInput({
  storyContent,
  options,
  artStyle,
}: {
  storyContent: string
  options: QuickMangaOptions
  artStyle?: string | null
}) {
  const baseContent = storyContent.trim()
  if (!options.enabled || !baseContent) {
    return baseContent
  }

  const directive = buildQuickMangaDirective({
    content: baseContent,
    options,
    artStyle,
    phase: 'story-input',
  })

  return `${directive}\n\n${baseContent}`
}

export function buildQuickMangaStoryboardInput({
  clipContent,
  options,
  artStyle,
}: {
  clipContent: string
  options: QuickMangaOptions
  artStyle?: string | null
}) {
  const baseContent = clipContent.trim()
  if (!options.enabled || !baseContent) {
    return baseContent
  }

  const directive = buildQuickMangaDirective({
    content: baseContent,
    options,
    artStyle,
    phase: 'storyboard-refine',
  })

  return `${directive}\n\n${baseContent}`
}
