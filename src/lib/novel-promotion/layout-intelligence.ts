export type LayoutIntelligenceProfile = 'four-koma-rhythm' | 'splash-impact' | 'vertical-strip-flow'

export type LayoutSelectable = 'auto' | 'cinematic' | 'four-koma' | 'vertical-scroll' | 'splash-focus'

type QuickMangaPreset = 'auto' | 'action-battle' | 'romance-drama' | 'slice-of-life' | 'comedy-4koma'

export interface LayoutIntelligenceDecision {
  recommendedProfile: LayoutIntelligenceProfile
  recommendedLayout: Exclude<LayoutSelectable, 'auto' | 'cinematic'>
  chosenLayout: Exclude<LayoutSelectable, 'auto'>
  chosenProfile: LayoutIntelligenceProfile
  decisionSource: 'auto_recommendation' | 'manual_override'
  confidence: number
  reasons: string[]
  debugTrace: {
    ruleVersion: 'layout-intelligence-v1'
    scores: Record<LayoutIntelligenceProfile, number>
    metrics: {
      paragraphCount: number
      dialogueDensity: number
      averageSentenceWords: number
      exclamationCount: number
      transitionKeywordCount: number
      intensityKeywordCount: number
      humorKeywordCount: number
    }
    signals: string[]
  }
}

const PROFILE_PRIORITY: LayoutIntelligenceProfile[] = [
  'splash-impact',
  'four-koma-rhythm',
  'vertical-strip-flow',
]

const INTENSITY_KEYWORDS = [
  'battle', 'fight', 'explosion', 'explosive', 'impact', 'climax', 'boss', 'rage', 'attack', 'critical',
  'chiến', 'đánh', 'nổ', 'đột kích', 'cao trào',
]

const HUMOR_KEYWORDS = [
  'joke', 'funny', 'comedy', 'punchline', 'gag', 'chibi',
  'hài', 'gây cười', 'chọc cười', 'tấu hài',
]

const TRANSITION_KEYWORDS = [
  'later', 'suddenly', 'meanwhile', 'after', 'next', 'then', 'at dawn', 'at night',
  'sau đó', 'trong khi đó', 'bỗng', 'tiếp theo', 'lúc này',
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toLower(value: string): string {
  return value.toLowerCase()
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function resolveRecommendedProfile(scores: Record<LayoutIntelligenceProfile, number>): LayoutIntelligenceProfile {
  const maxScore = Math.max(...Object.values(scores))
  const tied = PROFILE_PRIORITY.filter((profile) => scores[profile] === maxScore)
  return tied[0] || 'vertical-strip-flow'
}

function mapProfileToLayout(profile: LayoutIntelligenceProfile): Exclude<LayoutSelectable, 'auto' | 'cinematic'> {
  if (profile === 'four-koma-rhythm') return 'four-koma'
  if (profile === 'splash-impact') return 'splash-focus'
  return 'vertical-scroll'
}

function mapManualLayoutToProfile(layout: Exclude<LayoutSelectable, 'auto'>): LayoutIntelligenceProfile {
  if (layout === 'four-koma') return 'four-koma-rhythm'
  if (layout === 'splash-focus') return 'splash-impact'
  if (layout === 'vertical-scroll') return 'vertical-strip-flow'
  return 'vertical-strip-flow'
}

export function evaluateLayoutIntelligence(params: {
  content: string
  preset: QuickMangaPreset
  manualLayout: LayoutSelectable
}): LayoutIntelligenceDecision {
  const normalizedContent = params.content.trim()
  const lowered = toLower(normalizedContent)

  const paragraphs = normalizedContent
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const words = normalizedContent
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  const sentenceChunks = normalizedContent
    .split(/[.!?。！？]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  const dialogueHits = (normalizedContent.match(/["“”'「」]/g) || []).length
  const exclamationCount = (normalizedContent.match(/[!！]/g) || []).length
  const uppercaseWords = words.filter((word) => /[A-Z]{3,}/.test(word)).length

  const paragraphCount = paragraphs.length || 1
  const dialogueDensity = words.length > 0 ? dialogueHits / words.length : 0
  const averageSentenceWords = sentenceChunks.length > 0
    ? words.length / sentenceChunks.length
    : words.length

  const intensityKeywordCount = countKeywordHits(lowered, INTENSITY_KEYWORDS)
  const humorKeywordCount = countKeywordHits(lowered, HUMOR_KEYWORDS)
  const transitionKeywordCount = countKeywordHits(lowered, TRANSITION_KEYWORDS)

  const scores: Record<LayoutIntelligenceProfile, number> = {
    'four-koma-rhythm': 0,
    'splash-impact': 0,
    'vertical-strip-flow': 0,
  }
  const signals: string[] = []

  if (params.preset === 'comedy-4koma') {
    scores['four-koma-rhythm'] += 3
    signals.push('preset=comedy-4koma boosts four-koma rhythm')
  }
  if (params.preset === 'action-battle') {
    scores['splash-impact'] += 3
    signals.push('preset=action-battle boosts splash impact')
  }
  if (params.preset === 'slice-of-life' || params.preset === 'romance-drama') {
    scores['vertical-strip-flow'] += 1.5
    signals.push('preset favors vertical continuity pacing')
  }

  if (dialogueDensity >= 0.2) {
    scores['four-koma-rhythm'] += 2
    signals.push('high dialogue density suggests compact beat rhythm')
  }
  if (averageSentenceWords <= 11) {
    scores['four-koma-rhythm'] += 1
    signals.push('short sentence cadence supports four-koma timing')
  }
  if (humorKeywordCount >= 1) {
    scores['four-koma-rhythm'] += 1 + Math.min(humorKeywordCount, 2)
    signals.push('humor signals detected for four-koma profile')
  }

  if (intensityKeywordCount >= 2) {
    scores['splash-impact'] += 2
    signals.push('high-intensity keywords suggest splash panel emphasis')
  }
  if (exclamationCount >= 3) {
    scores['splash-impact'] += 1
    signals.push('exclamation spikes reinforce splash moments')
  }
  if (uppercaseWords >= 2) {
    scores['splash-impact'] += 1
    signals.push('emphasis words indicate impact-first framing')
  }

  if (paragraphCount >= 4) {
    scores['vertical-strip-flow'] += 2
    signals.push('multi-paragraph flow favors vertical strip continuity')
  }
  if (transitionKeywordCount >= 2) {
    scores['vertical-strip-flow'] += 2
    signals.push('transition markers suggest chapter-like scrolling flow')
  }
  if (averageSentenceWords >= 14) {
    scores['vertical-strip-flow'] += 1
    signals.push('long-form cadence better fits vertical strip pacing')
  }

  const recommendedProfile = resolveRecommendedProfile(scores)
  const recommendedLayout = mapProfileToLayout(recommendedProfile)

  const chosenLayout = params.manualLayout === 'auto'
    ? recommendedLayout
    : params.manualLayout
  const chosenProfile = params.manualLayout === 'auto'
    ? recommendedProfile
    : mapManualLayoutToProfile(params.manualLayout)

  const totalScore = Object.values(scores).reduce((acc, value) => acc + value, 0)
  const confidence = totalScore <= 0
    ? 0.34
    : clamp(scores[recommendedProfile] / totalScore, 0.34, 0.95)

  const reasons = signals.slice(0, 4)

  return {
    recommendedProfile,
    recommendedLayout,
    chosenLayout,
    chosenProfile,
    decisionSource: params.manualLayout === 'auto' ? 'auto_recommendation' : 'manual_override',
    confidence: round(confidence),
    reasons,
    debugTrace: {
      ruleVersion: 'layout-intelligence-v1',
      scores: {
        'four-koma-rhythm': round(scores['four-koma-rhythm']),
        'splash-impact': round(scores['splash-impact']),
        'vertical-strip-flow': round(scores['vertical-strip-flow']),
      },
      metrics: {
        paragraphCount,
        dialogueDensity: round(dialogueDensity),
        averageSentenceWords: round(averageSentenceWords),
        exclamationCount,
        transitionKeywordCount,
        intensityKeywordCount,
        humorKeywordCount,
      },
      signals,
    },
  }
}
