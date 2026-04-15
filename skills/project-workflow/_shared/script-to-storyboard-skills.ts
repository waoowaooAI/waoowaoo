import type {
  ActingDirection,
  PhotographyRule,
  StoryboardPanel,
} from '@/lib/storyboard-phases'
import type {
  ScriptToStoryboardClipContext,
  ScriptToStoryboardProjectContext,
  ScriptToStoryboardSkillRunner,
} from './script-to-storyboard-types'
import {
  buildClipJsonContext,
  buildStoryboardStepMeta,
  mergePanelsWithRules,
  parseJsonArray,
  parseScreenplay,
  runStoryboardStepWithRetry,
} from './script-to-storyboard-runtime'
import { composeSkillPrompt, type SkillLocale } from './prompt-runtime'

export async function executePlanStoryboardPhase1Skill(params: {
  clipContext: ScriptToStoryboardClipContext
  project: ScriptToStoryboardProjectContext
  locale: SkillLocale
  runStep: ScriptToStoryboardSkillRunner
  stepIndex: number
  stepTotal: number
}) {
  const screenplay = parseScreenplay(params.clipContext.clip.screenplay)
  const clipContent = typeof params.clipContext.clip.content === 'string' ? params.clipContext.clip.content.trim() : ''
  const prompt = composeSkillPrompt({
    skillId: 'plan-storyboard-phase1',
    locale: params.locale,
    replacements: {
      characters_lib_name: params.project.charactersLibName,
      locations_lib_name: params.project.locationsLibName,
      characters_introduction: params.project.charactersIntroduction,
      characters_appearance_list: params.clipContext.filteredAppearanceList,
      characters_full_description: params.clipContext.filteredFullDescription,
      props_description: params.clipContext.filteredPropsDescription,
      clip_json: buildClipJsonContext(params.clipContext.clip, params.clipContext),
      clip_content: screenplay ? `【剧本格式】\n${JSON.stringify(screenplay, null, 2)}` : clipContent,
    },
  })

  const { parsed } = await runStoryboardStepWithRetry({
    runStep: params.runStep,
    baseMeta: buildStoryboardStepMeta(
      `clip_${params.clipContext.clip.id}_phase1`,
      'progress.streamStep.storyboardPlan',
      params.stepIndex,
      params.stepTotal,
      {
        groupId: `clip_${params.clipContext.clip.id}`,
        parallelKey: 'phase1',
        retryable: true,
      },
    ),
    prompt,
    action: 'storyboard_phase1_plan',
    maxOutputTokens: 2600,
    parse: (text) => {
      const panels = parseJsonArray<StoryboardPanel>(text, `phase1:${params.clipContext.clip.id}`)
      if (panels.length === 0) {
        throw new Error(`Phase 1 returned empty panels for clip ${params.clipContext.clip.id}`)
      }
      return panels
    },
  })

  return parsed
}

export async function executeRefineCinematographySkill(params: {
  clipId: string
  phase1Panels: StoryboardPanel[]
  clipContext: ScriptToStoryboardClipContext
  locale: SkillLocale
  runStep: ScriptToStoryboardSkillRunner
  stepIndex: number
  stepTotal: number
}) {
  const prompt = composeSkillPrompt({
    skillId: 'refine-cinematography',
    locale: params.locale,
    replacements: {
      panels_json: JSON.stringify(params.phase1Panels, null, 2),
      panel_count: String(params.phase1Panels.length),
      locations_description: params.clipContext.filteredLocationsDescription,
      characters_info: params.clipContext.filteredFullDescription,
      props_description: params.clipContext.filteredPropsDescription,
    },
  })

  const { parsed } = await runStoryboardStepWithRetry({
    runStep: params.runStep,
    baseMeta: buildStoryboardStepMeta(
      `clip_${params.clipId}_phase2_cinematography`,
      'progress.streamStep.cinematographyRules',
      params.stepIndex,
      params.stepTotal,
      {
        dependsOn: [`clip_${params.clipId}_phase1`],
        groupId: `clip_${params.clipId}`,
        parallelKey: 'phase2',
        retryable: true,
      },
    ),
    prompt,
    action: 'storyboard_phase2_cinematography',
    maxOutputTokens: 2400,
    parse: (text) => parseJsonArray<PhotographyRule>(text, `phase2:${params.clipId}`),
  })

  return parsed
}

export async function executeRefineActingSkill(params: {
  clipId: string
  phase1Panels: StoryboardPanel[]
  clipContext: ScriptToStoryboardClipContext
  locale: SkillLocale
  runStep: ScriptToStoryboardSkillRunner
  stepIndex: number
  stepTotal: number
}) {
  const prompt = composeSkillPrompt({
    skillId: 'refine-acting',
    locale: params.locale,
    replacements: {
      panels_json: JSON.stringify(params.phase1Panels, null, 2),
      panel_count: String(params.phase1Panels.length),
      characters_info: params.clipContext.filteredFullDescription,
    },
  })

  const { parsed } = await runStoryboardStepWithRetry({
    runStep: params.runStep,
    baseMeta: buildStoryboardStepMeta(
      `clip_${params.clipId}_phase2_acting`,
      'progress.streamStep.actingDirection',
      params.stepIndex,
      params.stepTotal,
      {
        dependsOn: [`clip_${params.clipId}_phase1`],
        groupId: `clip_${params.clipId}`,
        parallelKey: 'phase2',
        retryable: true,
      },
    ),
    prompt,
    action: 'storyboard_phase2_acting',
    maxOutputTokens: 2400,
    parse: (text) => parseJsonArray<ActingDirection>(text, `phase2-acting:${params.clipId}`),
  })

  return parsed
}

export async function executeRefineStoryboardDetailSkill(params: {
  clipId: string
  phase1Panels: StoryboardPanel[]
  clipContext: ScriptToStoryboardClipContext
  locale: SkillLocale
  runStep: ScriptToStoryboardSkillRunner
  stepIndex: number
  stepTotal: number
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const prompt = composeSkillPrompt({
    skillId: 'refine-storyboard-detail',
    locale: params.locale,
    replacements: {
      panels_json: JSON.stringify(params.phase1Panels, null, 2),
      characters_age_gender: params.clipContext.filteredFullDescription,
      locations_description: params.clipContext.filteredLocationsDescription,
      props_description: params.clipContext.filteredPropsDescription,
    },
  })

  const { parsed } = await runStoryboardStepWithRetry({
    runStep: params.runStep,
    baseMeta: buildStoryboardStepMeta(
      `clip_${params.clipId}_phase3_detail`,
      'progress.streamStep.storyboardDetailRefine',
      params.stepIndex,
      params.stepTotal,
      {
        dependsOn: [
          `clip_${params.clipId}_phase2_cinematography`,
          `clip_${params.clipId}_phase2_acting`,
        ],
        groupId: `clip_${params.clipId}`,
        parallelKey: 'phase3',
        retryable: true,
      },
    ),
    prompt,
    action: 'storyboard_phase3_detail',
    maxOutputTokens: 2600,
    parse: (text) => {
      const panels = parseJsonArray<StoryboardPanel>(text, `phase3:${params.clipId}`)
      const filtered = panels.filter(
        (panel) => panel.description && panel.description !== '无' && panel.location !== '无',
      )
      if (filtered.length === 0) {
        throw new Error(`Phase 3 returned empty valid panels for clip ${params.clipId}`)
      }
      return filtered
    },
  })

  return mergePanelsWithRules({
    finalPanels: parsed,
    photographyRules: params.photographyRules,
    actingDirections: params.actingDirections,
  })
}
