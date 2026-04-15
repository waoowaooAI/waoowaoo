import { safeParseJsonArray, safeParseJsonObject } from '@/lib/json-repair'
import { buildCharactersIntroduction } from '@/lib/constants'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { createScopedLogger } from '@/lib/logging/core'
import { createClipContentMatcher } from '@/lib/project-workflow/story-to-script/clip-matching'
import type {
  StoryToScriptAnalysisResult,
  StoryToScriptClipCandidate,
  StoryToScriptPreparedContext,
  StoryToScriptScreenplayResult,
  StoryToScriptSkillRunner,
  StoryToScriptStepMeta,
  StoryToScriptStepOutput,
} from './story-to-script-types'
import { composeSkillPrompt, type SkillLocale } from './prompt-runtime'

const logger = createScopedLogger({ module: 'skill.story_to_script' })

const MAX_STEP_ATTEMPTS = 3
const MAX_SPLIT_BOUNDARY_ATTEMPTS = 2
const MAX_RETRY_DELAY_MS = 10_000

export const CLIP_BOUNDARY_SUFFIX = `

[Boundary Constraints]
1. The "start" and "end" anchors must come from the original text and be locatable.
2. Allow punctuation/whitespace differences, but do not rewrite key entities or events.
3. If anchors cannot be located reliably, return [] directly.`

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function toObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
}

export function extractAnalyzedCharacters(obj: Record<string, unknown>): Record<string, unknown>[] {
  const primary = toObjectArray(obj.characters)
  if (primary.length > 0) return primary
  return toObjectArray(obj.new_characters)
}

export function extractAnalyzedLocations(obj: Record<string, unknown>): Record<string, unknown>[] {
  return toObjectArray(obj.locations)
}

export function extractAnalyzedProps(obj: Record<string, unknown>): Record<string, unknown>[] {
  return toObjectArray(obj.props)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeRetryDelayMs(attempt: number) {
  const base = Math.min(1_000 * Math.pow(2, Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS)
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
}

function isRecoverableJsonParseError(error: unknown, normalizedMessage: string): boolean {
  if (normalizedMessage.includes('ark responses 调用失败')) return false
  if (normalizedMessage.includes('invalidparameter')) return false
  if (normalizedMessage.includes('unknown field')) return false

  if (error instanceof SyntaxError) return true

  return normalizedMessage.includes('unexpected token')
    || normalizedMessage.includes('unexpected end of json input')
    || normalizedMessage.includes('json format invalid')
    || normalizedMessage.includes('invalid clip json format')
}

export async function runStoryToScriptStepWithRetry<T>(params: {
  runStep: StoryToScriptSkillRunner
  baseMeta: StoryToScriptStepMeta
  prompt: string
  action: string
  maxOutputTokens: number
  parse: (text: string) => T
}): Promise<{ output: StoryToScriptStepOutput; parsed: T }> {
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
      const lowerMessage = normalizedError.message.toLowerCase()
      const shouldRetry = attempt < MAX_STEP_ATTEMPTS
        && (normalizedError.retryable || isRecoverableJsonParseError(error, lowerMessage))

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

export function parseAnalysisObject(text: string): Record<string, unknown> {
  return safeParseJsonObject(text)
}

export function parseClipArray(text: string): Record<string, unknown>[] {
  return safeParseJsonArray(text, 'clips')
}

export function parseScreenplayObject(text: string): Record<string, unknown> {
  return safeParseJsonObject(text)
}

export function buildPreparedStoryContext(params: {
  characterResult: StoryToScriptAnalysisResult
  locationResult: StoryToScriptAnalysisResult
  propResult: StoryToScriptAnalysisResult
  baseCharacters: string[]
  baseLocations: string[]
  baseProps: string[]
  baseCharacterIntroductions: Array<{ name: string; introduction?: string | null }>
}): StoryToScriptPreparedContext {
  const analyzedCharacters = params.characterResult.rows
  const analyzedLocations = params.locationResult.rows
  const analyzedProps = params.propResult.rows

  const analyzedCharacterNames = analyzedCharacters
    .map((item) => asString(item.name).trim())
    .filter(Boolean)
  const analyzedLocationNames = analyzedLocations
    .map((item) => asString(item.name).trim())
    .filter(Boolean)
  const analyzedPropNames = analyzedProps
    .map((item) => asString(item.name).trim())
    .filter(Boolean)

  const analyzedCharacterNameSet = new Set(analyzedCharacterNames)
  const analyzedPropNameSet = new Set(analyzedPropNames)

  const charactersLibName = [
    ...analyzedCharacterNames,
    ...params.baseCharacters.filter((name) => !analyzedCharacterNameSet.has(name)),
  ].join('、') || '无'

  const locationsLibName = analyzedLocationNames.length > 0
    ? analyzedLocationNames.join('、')
    : (params.baseLocations.join('、') || '无')

  const propsLibName = [
    ...analyzedPropNames,
    ...params.baseProps.filter((name) => !analyzedPropNameSet.has(name)),
  ].join('、') || '无'

  const mergedCharacterIntroductions = [
    ...analyzedCharacters.map((item) => ({
      name: asString(item.name),
      introduction: asString(item.introduction),
    })),
    ...params.baseCharacterIntroductions
      .filter((item) => !analyzedCharacterNameSet.has(item.name))
      .map((item) => ({
        name: item.name,
        introduction: item.introduction || '',
      })),
  ]

  const charactersIntroduction = buildCharactersIntroduction(
    mergedCharacterIntroductions.length > 0
      ? mergedCharacterIntroductions
      : params.baseCharacterIntroductions.map((item) => ({
        name: item.name,
        introduction: item.introduction || '',
      })),
  )

  return {
    analyzedCharacters,
    analyzedLocations,
    analyzedProps,
    charactersObject: params.characterResult.parsedObject,
    locationsObject: params.locationResult.parsedObject,
    propsObject: params.propResult.parsedObject,
    charactersLibName,
    locationsLibName,
    propsLibName,
    charactersIntroduction,
  }
}

export async function runSplitClipBoundaryMatch(params: {
  content: string
  locale: SkillLocale
  prepared: StoryToScriptPreparedContext
  runStep: StoryToScriptSkillRunner
}): Promise<{ splitStep: StoryToScriptStepOutput; clipList: StoryToScriptClipCandidate[] }> {
  const splitPromptBase = composeSkillPrompt({
    skillId: 'split-clips',
    locale: params.locale,
    replacements: {
      input: params.content,
      locations_lib_name: params.prepared.locationsLibName || '无',
      characters_lib_name: params.prepared.charactersLibName || '无',
      props_lib_name: params.prepared.propsLibName || '无',
      characters_introduction: params.prepared.charactersIntroduction || '暂无角色介绍',
    },
  })
  const splitPrompt = `${splitPromptBase}${CLIP_BOUNDARY_SUFFIX}`

  let splitStep: StoryToScriptStepOutput | null = null
  let clipList: StoryToScriptClipCandidate[] = []
  let lastBoundaryError: Error | null = null

  for (let attempt = 1; attempt <= MAX_SPLIT_BOUNDARY_ATTEMPTS; attempt += 1) {
    const splitMeta: StoryToScriptStepMeta = {
      stepId: 'split_clips',
      stepAttempt: attempt,
      stepTitle: 'progress.streamStep.splitClips',
      stepIndex: 4,
      stepTotal: 5,
      dependsOn: ['analyze_characters', 'analyze_locations', 'analyze_props'],
      retryable: true,
    }

    const { output, parsed: rawClipList } = await runStoryToScriptStepWithRetry({
      runStep: params.runStep,
      baseMeta: splitMeta,
      prompt: splitPrompt,
      action: 'split_clips',
      maxOutputTokens: 2600,
      parse: parseClipArray,
    })
    if (rawClipList.length === 0) {
      lastBoundaryError = new Error('split_clips returned empty clips')
      continue
    }

    const matcher = createClipContentMatcher(params.content)
    const nextClipList: StoryToScriptClipCandidate[] = []
    let searchFrom = 0
    let failedAt: { clipId: string; startText: string; endText: string } | null = null

    for (let index = 0; index < rawClipList.length; index += 1) {
      const item = rawClipList[index]
      const startText = asString(item.start)
      const endText = asString(item.end)
      const clipId = `clip_${index + 1}`
      const match = matcher.matchBoundary(startText, endText, searchFrom)
      if (!match) {
        failedAt = { clipId, startText, endText }
        break
      }

      nextClipList.push({
        id: clipId,
        startText,
        endText,
        summary: asString(item.summary),
        location: asString(item.location) || null,
        characters: toStringArray(item.characters),
        props: toStringArray(item.props),
        content: params.content.slice(match.startIndex, match.endIndex),
        matchLevel: match.level,
        matchConfidence: match.confidence,
      })
      searchFrom = match.endIndex
    }

    if (!failedAt) {
      splitStep = output
      clipList = nextClipList
      break
    }

    lastBoundaryError = new Error(
      `split_clips boundary matching failed at ${failedAt.clipId}: start="${failedAt.startText}" end="${failedAt.endText}"`,
    )
  }

  if (!splitStep) {
    throw lastBoundaryError || new Error('split_clips boundary matching failed')
  }

  return {
    splitStep,
    clipList,
  }
}

export function summarizeScreenplayResults(screenplayResults: StoryToScriptScreenplayResult[]) {
  const screenplaySuccessCount = screenplayResults.filter((item) => item.success).length
  const screenplayFailedCount = screenplayResults.length - screenplaySuccessCount
  const totalScenes = screenplayResults.reduce((sum, item) => sum + item.sceneCount, 0)
  return {
    screenplaySuccessCount,
    screenplayFailedCount,
    totalScenes,
  }
}
