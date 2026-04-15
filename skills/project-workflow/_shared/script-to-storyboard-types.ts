import type {
  ActingDirection,
  CharacterAsset,
  ClipCharacterRef,
  LocationAsset,
  PhotographyRule,
  PropAsset,
  StoryboardPanel,
} from '@/lib/storyboard-phases'
import type { SkillLocale } from './prompt-runtime'

export type ScriptToStoryboardStepMeta = {
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

export type ScriptToStoryboardStepOutput = {
  text: string
  reasoning: string
}

export type ScriptToStoryboardSkillRunner = (
  meta: ScriptToStoryboardStepMeta,
  prompt: string,
  action: string,
  maxOutputTokens: number,
) => Promise<ScriptToStoryboardStepOutput>

export type ScriptToStoryboardClipInput = {
  id: string
  content: string | null
  characters: string | null
  location: string | null
  props?: string | null
  screenplay: string | null
}

export type ClipStoryboardPanels = {
  clipId: string
  clipIndex: number
  finalPanels: StoryboardPanel[]
}

export type ScriptToStoryboardClipContext = {
  clip: ScriptToStoryboardClipInput
  clipCharacters: ClipCharacterRef[]
  clipLocation: string | null
  clipProps: string[]
  filteredAppearanceList: string
  filteredFullDescription: string
  filteredLocationsDescription: string
  filteredPropsDescription: string
}

export type ScriptToStoryboardProjectContext = {
  characters: CharacterAsset[]
  locations: LocationAsset[]
  props: PropAsset[]
  charactersLibName: string
  locationsLibName: string
  charactersIntroduction: string
}

export type ScriptToStoryboardWorkflowInput = {
  concurrency?: number
  locale?: SkillLocale
  clips: ScriptToStoryboardClipInput[]
  projectData: {
    characters: CharacterAsset[]
    locations: LocationAsset[]
    props?: PropAsset[]
  }
  novelText: string
  runStep: ScriptToStoryboardSkillRunner
}

export type ScriptToStoryboardWorkflowResult = {
  clipPanels: ClipStoryboardPanels[]
  phase1PanelsByClipId: Record<string, StoryboardPanel[]>
  phase2CinematographyByClipId: Record<string, PhotographyRule[]>
  phase2ActingByClipId: Record<string, ActingDirection[]>
  phase3PanelsByClipId: Record<string, StoryboardPanel[]>
  voiceLineRows: Record<string, unknown>[]
  summary: {
    clipCount: number
    totalPanelCount: number
    totalStepCount: number
  }
}
