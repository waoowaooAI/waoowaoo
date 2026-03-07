import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import {
  getUserWorkflowConcurrencyConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import { buildCharactersIntroduction } from '@/lib/constants'
import { TaskTerminatedError } from '@/lib/task/errors'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import {
  type ScriptToStoryboardStepMeta,
  type ScriptToStoryboardStepOutput,
} from '@/lib/novel-promotion/script-to-storyboard/orchestrator'
import { runScriptToStoryboardGraph } from '@/lib/workflows/script-to-storyboard/graph'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  asJsonRecord,
  buildStoryboardJson,
  parseEffort,
  parseTemperature,
  parseVoiceLinesJson,
  persistStoryboardsAndPanels,
  toPositiveInt,
  type JsonRecord,
} from './script-to-storyboard-helpers'
import { buildPrompt, getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createArtifact } from '@/lib/run-runtime/service'
import {
  parseStoryboardRetryTarget,
  runScriptToStoryboardAtomicRetry,
} from './script-to-storyboard-atomic-retry'

type AnyObj = Record<string, unknown>
const MAX_VOICE_ANALYZE_ATTEMPTS = 2

function isReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
}

export async function handleScriptToStoryboardTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const episodeIdRaw = typeof payload.episodeId === 'string' ? payload.episodeId : (job.data.episodeId || '')
  const episodeId = episodeIdRaw.trim()
  const inputModel = typeof payload.model === 'string' ? payload.model.trim() : ''
  const retryStepKey = typeof payload.retryStepKey === 'string' ? payload.retryStepKey.trim() : ''
  const retryStepAttempt = typeof payload.retryStepAttempt === 'number' && Number.isFinite(payload.retryStepAttempt)
    ? Math.max(1, Math.floor(payload.retryStepAttempt))
    : 1
  const reasoning = payload.reasoning !== false
  const requestedReasoningEffort = parseEffort(payload.reasoningEffort)
  const temperature = parseTemperature(payload.temperature)

  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      mode: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }
  if (project.mode !== 'novel-promotion') {
    throw new Error('Not a novel promotion project')
  }

  // Register project name for per-project log file routing
  onProjectNameAvailable(projectId, project.name)

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
      locations: true,
    },
  })
  if (!novelData) {
    throw new Error('Novel promotion data not found')
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: {
      clips: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!episode || episode.novelPromotionProjectId !== novelData.id) {
    throw new Error('Episode not found')
  }
  const clips = episode.clips || []
  if (clips.length === 0) {
    throw new Error('No clips found')
  }
  const retryTarget = parseStoryboardRetryTarget(retryStepKey)
  if (retryStepKey && retryStepKey !== 'voice_analyze' && !retryTarget) {
    throw new Error(`unsupported retry step for script_to_storyboard: ${retryStepKey}`)
  }
  const retryClipId = retryTarget?.clipId || null
  const selectedClips = retryClipId
    ? clips.filter((clip) => clip.id === retryClipId)
    : clips
  if (retryClipId && selectedClips.length === 0) {
    throw new Error(`Retry clip not found: ${retryClipId}`)
  }
  const skipVoiceAnalyze = !!retryStepKey && retryStepKey !== 'voice_analyze'

  const model = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel,
    projectAnalysisModel: novelData.analysisModel,
  })
  const [llmCapabilityOptions, workflowConcurrency] = await Promise.all([
    resolveProjectModelCapabilityGenerationOptions({
      projectId,
      userId: job.data.userId,
      modelType: 'llm',
      modelKey: model,
    }),
    getUserWorkflowConcurrencyConfig(job.data.userId),
  ])
  const capabilityReasoningEffort = llmCapabilityOptions.reasoningEffort
  const reasoningEffort = requestedReasoningEffort
    || (isReasoningEffort(capabilityReasoningEffort) ? capabilityReasoningEffort : 'high')

  await reportTaskProgress(job, 10, {
    stage: 'script_to_storyboard_prepare',
    stageLabel: 'progress.stage.scriptToStoryboardPrepare',
    displayMode: 'detail',
  })

  const phase1PlanTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_PLAN, job.data.locale)
  const phase2CinematographyTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CINEMATOGRAPHER, job.data.locale)
  const phase2ActingTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_ACTING_DIRECTION, job.data.locale)
  const phase3DetailTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_DETAIL, job.data.locale)

  const streamContext = createWorkerLLMStreamContext(job, 'script_to_storyboard')
  const callbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const runStep = async (
    meta: ScriptToStoryboardStepMeta,
    prompt: string,
    action: string,
    _maxOutputTokens: number,
  ): Promise<ScriptToStoryboardStepOutput> => {
    void _maxOutputTokens
    const stepAttempt = meta.stepAttempt
      || (retryStepKey && meta.stepId === retryStepKey ? retryStepAttempt : 1)
    await assertTaskActive(job, `script_to_storyboard_step:${meta.stepId}`)
    const progress = 15 + Math.min(70, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 70))
    await reportTaskProgress(job, progress, {
      stage: 'script_to_storyboard_step',
      stageLabel: 'progress.stage.scriptToStoryboardStep',
      displayMode: 'detail',
      message: meta.stepTitle,
      stepId: meta.stepId,
      stepAttempt,
      stepTitle: meta.stepTitle,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
      dependsOn: Array.isArray(meta.dependsOn) ? meta.dependsOn : [],
      groupId: meta.groupId || null,
      parallelKey: meta.parallelKey || null,
      retryable: meta.retryable !== false,
      blockedBy: Array.isArray(meta.blockedBy) ? meta.blockedBy : [],
    })

    // Log prompt input
    logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
      action: `SCRIPT_TO_STORYBOARD_PROMPT:${action}`,
      input: { stepId: meta.stepId, stepTitle: meta.stepTitle, prompt },
      model,
    })

    const output = await executeAiTextStep({
      userId: job.data.userId,
      model,
      messages: [{ role: 'user', content: prompt }],
      projectId,
      action,
      meta: {
        ...meta,
        stepAttempt,
      },
      temperature,
      reasoning,
      reasoningEffort,
    })
    // Ensure this step's stream terminal events are flushed before entering dependent steps.
    await callbacks.flush()

    // Log AI response output (full raw text included for JSON parse debugging)
    logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
      action: `SCRIPT_TO_STORYBOARD_OUTPUT:${action}`,
      output: {
        stepId: meta.stepId,
        stepTitle: meta.stepTitle,
        rawText: output.text,
        textLength: output.text.length,
        reasoningLength: output.reasoning.length,
      },
      model,
    })

    return {
      text: output.text,
      reasoning: output.reasoning,
    }
  }

  const payloadMeta = typeof payload.meta === 'object' && payload.meta !== null
    ? (payload.meta as AnyObj)
    : {}
  const runId = typeof payload.runId === 'string' && payload.runId.trim()
    ? payload.runId.trim()
    : (typeof payloadMeta.runId === 'string' ? payloadMeta.runId.trim() : '')
  if (!runId) {
    throw new Error('runId is required for script_to_storyboard pipeline')
  }

  const orchestratorResult = await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        callbacks,
        async () => {
          if (retryTarget) {
            const clipIndex = clips.findIndex((clip) => clip.id === retryTarget.clipId)
            if (clipIndex < 0) {
              throw new Error(`Retry clip not found: ${retryTarget.clipId}`)
            }
            const clip = clips[clipIndex]
            const atomicResult = await runScriptToStoryboardAtomicRetry({
              runId,
              retryTarget,
              retryStepAttempt,
              clip: {
                id: clip.id,
                content: clip.content,
                characters: clip.characters,
                location: clip.location,
                screenplay: clip.screenplay,
              },
              clipIndex,
              totalClipCount: clips.length,
              novelPromotionData: {
                characters: novelData.characters || [],
                locations: novelData.locations || [],
              },
              promptTemplates: {
                phase1PlanTemplate,
                phase2CinematographyTemplate,
                phase2ActingTemplate,
                phase3DetailTemplate,
              },
              runStep,
            })
            return {
              clipPanels: atomicResult.clipPanels,
              phase1PanelsByClipId: atomicResult.phase1PanelsByClipId,
              phase2CinematographyByClipId: atomicResult.phase2CinematographyByClipId,
              phase2ActingByClipId: atomicResult.phase2ActingByClipId,
              phase3PanelsByClipId: atomicResult.phase3PanelsByClipId,
              summary: {
                clipCount: selectedClips.length,
                totalPanelCount: atomicResult.totalPanelCount,
                totalStepCount: atomicResult.totalStepCount,
              },
            }
          }

          const pipelineState = await runScriptToStoryboardGraph({
            runId,
            projectId,
            userId: job.data.userId,
            concurrency: workflowConcurrency.analysis,
            clips: selectedClips.map((clip) => ({
              id: clip.id,
              content: clip.content,
              characters: clip.characters,
              location: clip.location,
              screenplay: clip.screenplay,
            })),
            novelPromotionData: {
              characters: novelData.characters || [],
              locations: novelData.locations || [],
            },
            promptTemplates: {
              phase1PlanTemplate,
              phase2CinematographyTemplate,
              phase2ActingTemplate,
              phase3DetailTemplate,
            },
            runStep,
            onParseError: (err) => {
              logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
                action: 'SCRIPT_TO_STORYBOARD_PARSE_ERROR',
                error: {
                  message: err.message,
                  rawTextPreview: err.rawText.slice(0, 3000),
                  rawTextLength: err.rawText.length,
                },
                model,
              })
            },
          })
          const result = pipelineState.orchestratorResult
          if (!result) {
            throw new Error('script_to_storyboard orchestrator produced no result')
          }
          return result
        },
      )
    } finally {
      await callbacks.flush()
    }
  })()

  const phase1Map = orchestratorResult.phase1PanelsByClipId || {}
  const phase2CinematographyMap = orchestratorResult.phase2CinematographyByClipId || {}
  const phase2ActingMap = orchestratorResult.phase2ActingByClipId || {}
  const phase3Map = orchestratorResult.phase3PanelsByClipId || {}

  for (const clip of selectedClips) {
    const phase1Panels = phase1Map[clip.id] || []
    if (phase1Panels.length > 0) {
      await createArtifact({
        runId,
        stepKey: `clip_${clip.id}_phase1`,
        artifactType: 'storyboard.clip.phase1',
        refId: clip.id,
        payload: {
          panels: phase1Panels,
        },
      })
    }
    const phase2Cinematography = phase2CinematographyMap[clip.id] || []
    if (phase2Cinematography.length > 0) {
      await createArtifact({
        runId,
        stepKey: `clip_${clip.id}_phase2_cinematography`,
        artifactType: 'storyboard.clip.phase2.cine',
        refId: clip.id,
        payload: {
          rules: phase2Cinematography,
        },
      })
    }
    const phase2Acting = phase2ActingMap[clip.id] || []
    if (phase2Acting.length > 0) {
      await createArtifact({
        runId,
        stepKey: `clip_${clip.id}_phase2_acting`,
        artifactType: 'storyboard.clip.phase2.acting',
        refId: clip.id,
        payload: {
          directions: phase2Acting,
        },
      })
    }
    const phase3Panels = phase3Map[clip.id] || []
    if (phase3Panels.length > 0) {
      await createArtifact({
        runId,
        stepKey: `clip_${clip.id}_phase3_detail`,
        artifactType: 'storyboard.clip.phase3',
        refId: clip.id,
        payload: {
          panels: phase3Panels,
        },
      })
    }
  }

  await reportTaskProgress(job, 80, {
    stage: 'script_to_storyboard_persist',
    stageLabel: 'progress.stage.scriptToStoryboardPersist',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'script_to_storyboard_persist')

  const persistedStoryboards = await persistStoryboardsAndPanels({
    episodeId,
    clipPanels: orchestratorResult.clipPanels,
  })

  if (skipVoiceAnalyze) {
    await reportTaskProgress(job, 96, {
      stage: 'script_to_storyboard_persist_done',
      stageLabel: 'progress.stage.scriptToStoryboardPersistDone',
      displayMode: 'detail',
      message: 'step retry complete',
      stepId: retryStepKey || undefined,
      stepAttempt:
        typeof payload.retryStepAttempt === 'number' && Number.isFinite(payload.retryStepAttempt)
          ? Math.max(1, Math.floor(payload.retryStepAttempt))
          : undefined,
    })
    return {
      episodeId,
      storyboardCount: persistedStoryboards.length,
      panelCount: orchestratorResult.summary.totalPanelCount,
      voiceLineCount: 0,
      retryStepKey,
    }
  }

  if (!episode.novelText || !episode.novelText.trim()) {
    throw new Error('No novel text to analyze')
  }

  const voicePrompt = buildPrompt({
    promptId: PROMPT_IDS.NP_VOICE_ANALYSIS,
    locale: job.data.locale,
    variables: {
      input: episode.novelText,
      characters_lib_name: (novelData.characters || []).length > 0
        ? (novelData.characters || []).map((item) => item.name).join('、')
        : '无',
      characters_introduction: buildCharactersIntroduction(novelData.characters || []),
      storyboard_json: buildStoryboardJson(persistedStoryboards),
    },
  })

  let voiceLineRows: JsonRecord[] | null = null
  let voiceLastError: Error | null = null
  const voiceStepMeta: ScriptToStoryboardStepMeta = {
    stepId: 'voice_analyze',
    stepTitle: 'progress.streamStep.voiceAnalyze',
    stepIndex: orchestratorResult.summary.totalStepCount,
    stepTotal: orchestratorResult.summary.totalStepCount,
    retryable: true,
  }
  try {
    for (let voiceAttempt = 1; voiceAttempt <= MAX_VOICE_ANALYZE_ATTEMPTS; voiceAttempt++) {
      const meta: ScriptToStoryboardStepMeta = {
        ...voiceStepMeta,
        stepAttempt: voiceAttempt,
      }
      try {
        const voiceOutput = await withInternalLLMStreamCallbacks(
          callbacks,
          async () => await runStep(meta, voicePrompt, 'voice_analyze', 2600),
        )
        voiceLineRows = parseVoiceLinesJson(voiceOutput.text)
        break
      } catch (error) {
        if (error instanceof TaskTerminatedError) {
          throw error
        }
        voiceLastError = error instanceof Error ? error : new Error(String(error))
        if (voiceAttempt < MAX_VOICE_ANALYZE_ATTEMPTS) {
          await reportTaskProgress(job, 84, {
            stage: 'script_to_storyboard_step',
            stageLabel: 'progress.stage.scriptToStoryboardStep',
            displayMode: 'detail',
            message: `台词分析失败，准备重试 (${voiceAttempt + 1}/${MAX_VOICE_ANALYZE_ATTEMPTS})`,
            stepId: voiceStepMeta.stepId,
            stepAttempt: voiceAttempt + 1,
            stepTitle: voiceStepMeta.stepTitle,
            stepIndex: voiceStepMeta.stepIndex,
            stepTotal: voiceStepMeta.stepTotal,
          })
        }
      }
    }
  } finally {
    await callbacks.flush()
  }
  if (!voiceLineRows) {
    throw voiceLastError!
  }

  await createArtifact({
    runId,
    stepKey: 'voice_analyze',
    artifactType: 'voice.lines',
    refId: episodeId,
    payload: {
      lines: voiceLineRows,
    },
  })

  await assertTaskActive(job, 'script_to_storyboard_voice_persist')
  const panelIdByStoryboardPanel = new Map<string, string>()
  for (const storyboard of persistedStoryboards) {
    for (const panel of storyboard.panels) {
      panelIdByStoryboardPanel.set(`${storyboard.storyboardId}:${panel.panelIndex}`, panel.id)
    }
  }

  const createdVoiceLines = await prisma.$transaction(async (tx) => {
    const voiceLineModel = tx.novelPromotionVoiceLine as unknown as {
      upsert?: (args: unknown) => Promise<{ id: string }>
      create: (args: unknown) => Promise<{ id: string }>
      deleteMany: (args: unknown) => Promise<unknown>
    }
    const created: Array<{ id: string }> = []
    for (let i = 0; i < voiceLineRows.length; i += 1) {
      const row = voiceLineRows[i] || {}
      const matchedPanel = asJsonRecord(row.matchedPanel)
      const matchedStoryboardId =
        matchedPanel && typeof matchedPanel.storyboardId === 'string'
          ? matchedPanel.storyboardId.trim()
          : null
      const matchedPanelIndex = matchedPanel ? toPositiveInt(matchedPanel.panelIndex) : null
      let matchedPanelId: string | null = null
      if (matchedPanel !== null) {
        if (!matchedStoryboardId || matchedPanelIndex === null) {
          throw new Error(`voice line ${i + 1} has invalid matchedPanel reference`)
        }
        const panelKey = `${matchedStoryboardId}:${matchedPanelIndex}`
        const resolvedPanelId = panelIdByStoryboardPanel.get(panelKey)
        if (!resolvedPanelId) {
          throw new Error(`voice line ${i + 1} references non-existent panel ${panelKey}`)
        }
        matchedPanelId = resolvedPanelId
      }

      if (typeof row.emotionStrength !== 'number' || !Number.isFinite(row.emotionStrength)) {
        throw new Error(`voice line ${i + 1} is missing valid emotionStrength`)
      }
      const emotionStrength = Math.min(1, Math.max(0.1, row.emotionStrength))

      if (typeof row.lineIndex !== 'number' || !Number.isFinite(row.lineIndex)) {
        throw new Error(`voice line ${i + 1} is missing valid lineIndex`)
      }
      const lineIndex = Math.floor(row.lineIndex)
      if (lineIndex <= 0) {
        throw new Error(`voice line ${i + 1} has invalid lineIndex`)
      }
      if (typeof row.speaker !== 'string' || !row.speaker.trim()) {
        throw new Error(`voice line ${i + 1} is missing valid speaker`)
      }
      if (typeof row.content !== 'string' || !row.content.trim()) {
        throw new Error(`voice line ${i + 1} is missing valid content`)
      }

      const upsertArgs = {
        where: {
          episodeId_lineIndex: {
            episodeId,
            lineIndex,
          },
        },
        create: {
          episodeId,
          lineIndex,
          speaker: row.speaker.trim(),
          content: row.content,
          emotionStrength,
          matchedPanelId,
          matchedStoryboardId: matchedPanelId ? matchedStoryboardId : null,
          matchedPanelIndex,
        },
        update: {
          speaker: row.speaker.trim(),
          content: row.content,
          emotionStrength,
          matchedPanelId,
          matchedStoryboardId: matchedPanelId ? matchedStoryboardId : null,
          matchedPanelIndex,
        },
        select: { id: true },
      }
      const createdRow = typeof voiceLineModel.upsert === 'function'
        ? await voiceLineModel.upsert(upsertArgs)
        : (
          process.env.NODE_ENV === 'test'
            ? await voiceLineModel.create({
              data: upsertArgs.create,
              select: { id: true },
            })
            : (() => { throw new Error('novelPromotionVoiceLine.upsert unavailable') })()
        )
      created.push(createdRow)
    }

    const nextLineIndexes = voiceLineRows
      .map((row) => (typeof row.lineIndex === 'number' && Number.isFinite(row.lineIndex) ? Math.floor(row.lineIndex) : -1))
      .filter((value) => value > 0)
    await voiceLineModel.deleteMany({
      where: {
        episodeId,
        lineIndex: {
          notIn: nextLineIndexes.length > 0 ? nextLineIndexes : [0],
        },
      },
    })
    return created
  }, { timeout: 15000 })

  await reportTaskProgress(job, 96, {
    stage: 'script_to_storyboard_persist_done',
    stageLabel: 'progress.stage.scriptToStoryboardPersistDone',
    displayMode: 'detail',
  })

  return {
    episodeId,
    storyboardCount: persistedStoryboards.length,
    panelCount: orchestratorResult.summary.totalPanelCount,
    voiceLineCount: createdVoiceLines.length,
  }
}
