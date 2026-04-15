import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import type {
  StoryToScriptAnalysisResult,
  StoryToScriptClipCandidate,
  StoryToScriptPreparedContext,
  StoryToScriptScreenplayResult,
  StoryToScriptSkillRunner,
  StoryToScriptStepMeta,
} from './story-to-script-types'
import {
  asString,
  extractAnalyzedCharacters,
  extractAnalyzedLocations,
  extractAnalyzedProps,
  parseAnalysisObject,
  parseScreenplayObject,
  runStoryToScriptStepWithRetry,
} from './story-to-script-runtime'
import { composeSkillPrompt, type SkillLocale } from './prompt-runtime'

async function runAnalysisSkill(params: {
  stepId: 'analyze_characters' | 'analyze_locations' | 'analyze_props'
  stepTitle: string
  stepIndex: number
  prompt: string
  action: string
  maxOutputTokens: number
  runStep: StoryToScriptSkillRunner
  groupId: string
  parallelKey: string
}): Promise<StoryToScriptAnalysisResult> {
  const { output, parsed } = await runStoryToScriptStepWithRetry({
    runStep: params.runStep,
    baseMeta: {
      stepId: params.stepId,
      stepTitle: params.stepTitle,
      stepIndex: params.stepIndex,
      stepTotal: 5,
      groupId: params.groupId,
      parallelKey: params.parallelKey,
      retryable: true,
    },
    prompt: params.prompt,
    action: params.action,
    maxOutputTokens: params.maxOutputTokens,
    parse: parseAnalysisObject,
  })

  const rows = params.stepId === 'analyze_characters'
    ? extractAnalyzedCharacters(parsed)
    : params.stepId === 'analyze_locations'
      ? extractAnalyzedLocations(parsed)
      : extractAnalyzedProps(parsed)

  return {
    stepOutput: output,
    parsedObject: parsed,
    rows,
  }
}

export async function executeAnalyzeCharactersSkill(params: {
  content: string
  baseCharacters: string[]
  baseCharacterIntroductions: Array<{ name: string; introduction?: string | null }>
  locale: SkillLocale
  runStep: StoryToScriptSkillRunner
}) {
  const baseCharactersText = params.baseCharacters.length > 0 ? params.baseCharacters.join('、') : '无'
  const baseCharacterInfo = params.baseCharacterIntroductions.length > 0
    ? params.baseCharacterIntroductions.map((item, index) => `${index + 1}. ${item.name}`).join('\n')
    : '暂无已有角色'
  const prompt = composeSkillPrompt({
    skillId: 'analyze-characters',
    locale: params.locale,
    replacements: {
      input: params.content,
      characters_lib_name: baseCharactersText,
      characters_lib_info: baseCharacterInfo,
    },
  })
  return await runAnalysisSkill({
    stepId: 'analyze_characters',
    stepTitle: 'progress.streamStep.analyzeCharacters',
    stepIndex: 1,
    prompt,
    action: 'analyze_characters',
    maxOutputTokens: 2200,
    runStep: params.runStep,
    groupId: 'analysis',
    parallelKey: 'characters',
  })
}

export async function executeAnalyzeLocationsSkill(params: {
  content: string
  baseLocations: string[]
  locale: SkillLocale
  runStep: StoryToScriptSkillRunner
}) {
  const baseLocationsText = params.baseLocations.length > 0 ? params.baseLocations.join('、') : '无'
  const prompt = composeSkillPrompt({
    skillId: 'analyze-locations',
    locale: params.locale,
    replacements: {
    input: params.content,
    locations_lib_name: baseLocationsText,
    },
  })
  return await runAnalysisSkill({
    stepId: 'analyze_locations',
    stepTitle: 'progress.streamStep.analyzeLocations',
    stepIndex: 2,
    prompt,
    action: 'analyze_locations',
    maxOutputTokens: 2200,
    runStep: params.runStep,
    groupId: 'analysis',
    parallelKey: 'locations',
  })
}

export async function executeAnalyzePropsSkill(params: {
  content: string
  baseProps: string[]
  locale: SkillLocale
  runStep: StoryToScriptSkillRunner
}) {
  const basePropsText = params.baseProps.length > 0 ? params.baseProps.join('、') : '无'
  const prompt = composeSkillPrompt({
    skillId: 'analyze-props',
    locale: params.locale,
    replacements: {
    input: params.content,
    props_lib_name: basePropsText,
    },
  })
  return await runAnalysisSkill({
    stepId: 'analyze_props',
    stepTitle: 'progress.streamStep.analyzeProps',
    stepIndex: 3,
    prompt,
    action: 'analyze_props',
    maxOutputTokens: 1600,
    runStep: params.runStep,
    groupId: 'analysis',
    parallelKey: 'props',
  })
}

export async function executeGenerateScreenplaySkill(params: {
  clipList: StoryToScriptClipCandidate[]
  prepared: StoryToScriptPreparedContext
  locale: SkillLocale
  runStep: StoryToScriptSkillRunner
  concurrency: number
  onStepError?: (meta: StoryToScriptStepMeta, message: string) => void
}): Promise<StoryToScriptScreenplayResult[]> {
  return await mapWithConcurrency(
    params.clipList,
    params.concurrency,
    async (clip, index): Promise<StoryToScriptScreenplayResult> => {
      const stepMeta: StoryToScriptStepMeta = {
        stepId: `screenplay_${clip.id}`,
        stepTitle: 'progress.streamStep.screenplayConversion',
        stepIndex: 5 + index,
        stepTotal: Math.max(5, 4 + params.clipList.length),
        dependsOn: ['split_clips'],
        groupId: 'screenplay_conversion',
        parallelKey: clip.id,
        retryable: true,
      }

      try {
        const screenplayPrompt = composeSkillPrompt({
          skillId: 'generate-screenplay',
          locale: params.locale,
          replacements: {
          clip_content: clip.content,
          locations_lib_name: params.prepared.locationsLibName || '无',
          characters_lib_name: params.prepared.charactersLibName || '无',
          props_lib_name: params.prepared.propsLibName || '无',
          characters_introduction: params.prepared.charactersIntroduction || '暂无角色介绍',
          clip_id: clip.id,
          },
        })

        const { parsed: screenplay } = await runStoryToScriptStepWithRetry({
          runStep: params.runStep,
          baseMeta: stepMeta,
          prompt: screenplayPrompt,
          action: 'screenplay_conversion',
          maxOutputTokens: 2200,
          parse: parseScreenplayObject,
        })
        const scenes = Array.isArray(screenplay.scenes) ? screenplay.scenes : []
        return {
          clipId: clip.id,
          success: true,
          sceneCount: scenes.length,
          screenplay,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        params.onStepError?.(stepMeta, message)
        return {
          clipId: clip.id,
          success: false,
          sceneCount: 0,
          error: message,
        }
      }
    },
  )
}
