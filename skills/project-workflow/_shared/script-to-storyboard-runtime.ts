import { safeParseJsonArray } from '@/lib/json-repair'
import { buildCharactersIntroduction } from '@/lib/constants'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { createScopedLogger } from '@/lib/logging/core'
import {
  type ActingDirection,
  type ClipCharacterRef,
  formatClipId,
  getFilteredAppearanceList,
  getFilteredFullDescription,
  getFilteredLocationsDescription,
  type PhotographyRule,
  type StoryboardPanel,
} from '@/lib/storyboard-phases'
import {
  buildPromptAssetContext,
  compileAssetPromptFragments,
} from '@/lib/assets/services/asset-prompt-context'
import { buildStoryboardJsonFromClipPanels, parseVoiceLinesJson } from '@/lib/workers/handlers/script-to-storyboard-helpers'
import type {
  ScriptToStoryboardClipContext,
  ScriptToStoryboardClipInput,
  ScriptToStoryboardProjectContext,
  ScriptToStoryboardSkillRunner,
  ScriptToStoryboardStepMeta,
  ScriptToStoryboardStepOutput,
} from './script-to-storyboard-types'
import { composeSkillPrompt, type SkillLocale } from './prompt-runtime'

type JsonRecord = Record<string, unknown>

const logger = createScopedLogger({ module: 'skill.script_to_storyboard' })
const MAX_STEP_ATTEMPTS = 3
const MAX_VOICE_ANALYZE_ATTEMPTS = 2
const MAX_RETRY_DELAY_MS = 10_000

export class SkillJsonParseError extends Error {
  rawText: string

  constructor(message: string, rawText: string) {
    super(message)
    this.name = 'SkillJsonParseError'
    this.rawText = rawText
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeRetryDelayMs(attempt: number) {
  const base = Math.min(1_000 * Math.pow(2, Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS)
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
}

export function parseJsonArray<T extends JsonRecord>(responseText: string, label: string): T[] {
  const rows = safeParseJsonArray(responseText)
  if (rows.length === 0) {
    throw new SkillJsonParseError(`${label}: empty result`, responseText)
  }
  return rows as T[]
}

function shouldRetryStepError(error: unknown, message: string, retryable: boolean) {
  if (error instanceof SkillJsonParseError) return true
  if (retryable) return true
  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes('ark responses 调用失败')) return false
  if (lowerMessage.includes('invalidparameter')) return false
  if (lowerMessage.includes('unknown field')) return false
  return lowerMessage.includes('unexpected token')
    || lowerMessage.includes('unexpected end of json input')
    || lowerMessage.includes('json format invalid')
    || lowerMessage.includes('invalid json output')
    || lowerMessage.includes('parse')
}

export async function runStoryboardStepWithRetry<T>(params: {
  runStep: ScriptToStoryboardSkillRunner
  baseMeta: ScriptToStoryboardStepMeta
  prompt: string
  action: string
  maxOutputTokens: number
  parse: (text: string) => T
}): Promise<{ output: ScriptToStoryboardStepOutput; parsed: T }> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt += 1) {
    const meta = attempt === 1
      ? params.baseMeta
      : {
        ...params.baseMeta,
        stepAttempt: attempt,
      }
    try {
      const output = await params.runStep(meta, params.prompt, params.action, params.maxOutputTokens)
      const parsed = params.parse(output.text)
      return { output, parsed }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const normalizedError = normalizeAnyError(error, { context: 'worker' })
      const shouldRetry = attempt < MAX_STEP_ATTEMPTS
        && shouldRetryStepError(error, normalizedError.message, normalizedError.retryable)

      logger.error({
        action: 'skill.retry',
        message: shouldRetry ? 'step failed, retrying' : 'step failed, no more retry',
        errorCode: normalizedError.code,
        retryable: normalizedError.retryable,
        details: {
          stepId: params.baseMeta.stepId,
          attempt,
          maxAttempts: MAX_STEP_ATTEMPTS,
        },
        error: {
          name: lastError.name,
          message: lastError.message,
          stack: lastError.stack,
        },
      })

      if (!shouldRetry) break
      await wait(computeRetryDelayMs(attempt))
    }
  }
  throw lastError || new Error(`skill step failed: ${params.baseMeta.stepId}`)
}

export function parseClipCharacters(raw: string | null): ClipCharacterRef[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('characters field must be JSON array')
    }
    return parsed as ClipCharacterRef[]
  } catch (error) {
    throw new Error(`Invalid clip characters JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function parseClipProps(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('props field must be JSON array')
    }
    return parsed.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  } catch (error) {
    throw new Error(`Invalid clip props JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function parseScreenplay(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid clip screenplay JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function buildProjectContext(params: {
  characters: ScriptToStoryboardProjectContext['characters']
  locations: ScriptToStoryboardProjectContext['locations']
  props: ScriptToStoryboardProjectContext['props']
}): ScriptToStoryboardProjectContext {
  return {
    characters: params.characters,
    locations: params.locations,
    props: params.props,
    charactersLibName: params.characters.map((item) => item.name).join(', ') || '无',
    locationsLibName: params.locations.map((item) => item.name).join(', ') || '无',
    charactersIntroduction: buildCharactersIntroduction(params.characters || []),
  }
}

export function buildClipContext(params: {
  clip: ScriptToStoryboardClipInput
  project: ScriptToStoryboardProjectContext
  locale: SkillLocale
}): ScriptToStoryboardClipContext {
  const clipCharacters = parseClipCharacters(params.clip.characters)
  const clipLocation = params.clip.location || null
  const clipProps = parseClipProps(params.clip.props ?? null)
  const filteredAppearanceList = getFilteredAppearanceList(params.project.characters || [], clipCharacters as never)
  const filteredFullDescription = getFilteredFullDescription(params.project.characters || [], clipCharacters as never)
  const filteredLocationsDescription = getFilteredLocationsDescription(
    params.project.locations || [],
    clipLocation,
    params.locale,
  )
  const filteredPropsDescription = compileAssetPromptFragments(buildPromptAssetContext({
    characters: [],
    locations: [],
    props: params.project.props || [],
    clipCharacters: [],
    clipLocation: null,
    clipProps,
  })).propsDescriptionText

  return {
    clip: params.clip,
    clipCharacters,
    clipLocation,
    clipProps,
    filteredAppearanceList,
    filteredFullDescription,
    filteredLocationsDescription,
    filteredPropsDescription,
  }
}

export function buildStoryboardStepMeta(stepId: string, stepTitle: string, stepIndex: number, stepTotal: number, extra?: Pick<ScriptToStoryboardStepMeta, 'dependsOn' | 'groupId' | 'parallelKey' | 'retryable'>): ScriptToStoryboardStepMeta {
  return {
    stepId,
    stepTitle,
    stepIndex,
    stepTotal,
    ...extra,
  }
}

export function mergePanelsWithRules(params: {
  finalPanels: StoryboardPanel[]
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const { finalPanels, photographyRules, actingDirections } = params
  return finalPanels.map((panel, index) => {
    const rules = photographyRules.find((rule) => rule.panel_number === panel.panel_number)
    if (!rules) {
      throw new Error(`Missing photography rule for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    const acting = actingDirections.find((item) => item.panel_number === panel.panel_number)
    if (!acting) {
      throw new Error(`Missing acting direction for panel_number=${String(panel.panel_number)} at index=${index}`)
    }

    return {
      ...panel,
      photographyPlan: {
        composition: rules.composition,
        lighting: rules.lighting,
        colorPalette: rules.color_palette,
        atmosphere: rules.atmosphere,
        technicalNotes: rules.technical_notes,
      },
      actingNotes: acting.characters,
    }
  })
}

export async function executeVoiceLinesWithRetry(params: {
  runStep: ScriptToStoryboardSkillRunner
  locale: SkillLocale
  novelText: string
  project: ScriptToStoryboardProjectContext
  clipPanels: Array<{ clipId: string; clipIndex: number; finalPanels: StoryboardPanel[] }>
  stepIndex: number
  stepTotal: number
}) {
  const voicePrompt = composeSkillPrompt({
    skillId: 'generate-voice-lines',
    locale: params.locale,
    replacements: {
      input: params.novelText,
      characters_lib_name: params.project.characters.length > 0
        ? params.project.characters.map((item) => item.name).join('、')
        : '无',
      characters_introduction: buildCharactersIntroduction(params.project.characters || []),
      storyboard_json: buildStoryboardJsonFromClipPanels(params.clipPanels),
    },
  })

  let voiceLineRows: Record<string, unknown>[] | null = null
  let voiceLastError: Error | null = null
  for (let voiceAttempt = 1; voiceAttempt <= MAX_VOICE_ANALYZE_ATTEMPTS; voiceAttempt += 1) {
    try {
      const { parsed } = await runStoryboardStepWithRetry({
        runStep: params.runStep,
        baseMeta: {
          stepId: 'voice_analyze',
          stepAttempt: voiceAttempt,
          stepTitle: 'progress.streamStep.voiceAnalyze',
          stepIndex: params.stepIndex,
          stepTotal: params.stepTotal,
          retryable: true,
        },
        prompt: voicePrompt,
        action: 'voice_analyze',
        maxOutputTokens: 2600,
        parse: parseVoiceLinesJson,
      })
      voiceLineRows = parsed
      break
    } catch (error) {
      voiceLastError = error instanceof Error ? error : new Error(String(error))
      if (voiceAttempt < MAX_VOICE_ANALYZE_ATTEMPTS) {
        await wait(computeRetryDelayMs(voiceAttempt))
      }
    }
  }

  if (!voiceLineRows) {
    throw voiceLastError || new Error('voice analyze failed')
  }
  return voiceLineRows
}

export function buildClipJsonContext(clip: ScriptToStoryboardClipInput, clipContext: ScriptToStoryboardClipContext) {
  const clipContent = typeof clip.content === 'string' ? clip.content.trim() : ''
  if (!clipContent) {
    throw new Error(`Clip ${formatClipId(clip as never)} content is empty`)
  }
  return JSON.stringify({
    id: clip.id,
    content: clipContent,
    characters: clipContext.clipCharacters,
    location: clipContext.clipLocation,
    props: clipContext.clipProps,
  }, null, 2)
}
