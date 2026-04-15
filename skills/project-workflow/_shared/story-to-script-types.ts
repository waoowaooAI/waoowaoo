import type { ClipMatchLevel } from '@/lib/project-workflow/story-to-script/clip-matching'
import type { SkillLocale } from './prompt-runtime'

export type StoryToScriptStepMeta = {
  stepId: string
  stepAttempt?: number
  stepTitle: string
  stepIndex: number
  stepTotal: number
  dependsOn?: string[]
  groupId?: string
  parallelKey?: string
  retryable?: boolean
  blockedBy?: string[]
}

export type StoryToScriptStepOutput = {
  text: string
  reasoning: string
}

export type StoryToScriptSkillRunner = (
  meta: StoryToScriptStepMeta,
  prompt: string,
  action: string,
  maxOutputTokens: number,
) => Promise<StoryToScriptStepOutput>

export type StoryToScriptClipCandidate = {
  id: string
  startText: string
  endText: string
  summary: string
  location: string | null
  characters: string[]
  props: string[]
  content: string
  matchLevel: ClipMatchLevel
  matchConfidence: number
}

export type StoryToScriptScreenplayResult = {
  clipId: string
  success: boolean
  sceneCount: number
  screenplay?: Record<string, unknown>
  error?: string
}

export type StoryToScriptAnalysisResult = {
  stepOutput: StoryToScriptStepOutput
  parsedObject: Record<string, unknown>
  rows: Record<string, unknown>[]
}

export type StoryToScriptPreparedContext = {
  analyzedCharacters: Record<string, unknown>[]
  analyzedLocations: Record<string, unknown>[]
  analyzedProps: Record<string, unknown>[]
  charactersObject: Record<string, unknown>
  locationsObject: Record<string, unknown>
  propsObject: Record<string, unknown>
  charactersLibName: string
  locationsLibName: string
  propsLibName: string
  charactersIntroduction: string
}

export type StoryToScriptWorkflowInput = {
  concurrency?: number
  locale?: SkillLocale
  content: string
  baseCharacters: string[]
  baseLocations: string[]
  baseProps?: string[]
  baseCharacterIntroductions: Array<{ name: string; introduction?: string | null }>
  runStep: StoryToScriptSkillRunner
  onStepError?: (meta: StoryToScriptStepMeta, message: string) => void
  onLog?: (message: string, details?: Record<string, unknown>) => void
}

export type StoryToScriptWorkflowResult = {
  characterStep: StoryToScriptStepOutput
  locationStep: StoryToScriptStepOutput
  propStep: StoryToScriptStepOutput
  splitStep: StoryToScriptStepOutput
  charactersObject: Record<string, unknown>
  locationsObject: Record<string, unknown>
  propsObject: Record<string, unknown>
  analyzedCharacters: Record<string, unknown>[]
  analyzedLocations: Record<string, unknown>[]
  analyzedProps: Record<string, unknown>[]
  charactersLibName: string
  locationsLibName: string
  propsLibName: string
  charactersIntroduction: string
  clipList: StoryToScriptClipCandidate[]
  screenplayResults: StoryToScriptScreenplayResult[]
  summary: {
    characterCount: number
    locationCount: number
    propCount: number
    clipCount: number
    screenplaySuccessCount: number
    screenplayFailedCount: number
    totalScenes: number
  }
}
