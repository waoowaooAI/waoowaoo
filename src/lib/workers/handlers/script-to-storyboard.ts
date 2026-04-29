import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import {
  getUserWorkflowConcurrencyConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import { TaskTerminatedError } from '@/lib/task/errors'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  type ScriptToStoryboardStepMeta,
  type ScriptToStoryboardStepOutput,
  type ScriptToStoryboardWorkflowResult,
} from '@/lib/skill-system/executors/script-to-storyboard/types'
import { runScriptToStoryboardSkillWorkflow } from '@/lib/skill-system/executors/script-to-storyboard/preset'
import { SkillJsonParseError } from '@/lib/skill-system/executors/script-to-storyboard/shared'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  parseEffort,
  parseTemperature,
} from './script-to-storyboard-helpers'
import type { SkillLocale } from '@skills/project-workflow/_shared/prompt-runtime'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createArtifact } from '@/lib/run-runtime/service'
import { assertWorkflowRunActive, withWorkflowRunLease } from '@/lib/run-runtime/workflow-lease'
import {
  parseStoryboardRetryTarget,
  runScriptToStoryboardAtomicRetry,
} from './script-to-storyboard-atomic-retry'
import { persistStoryboardWorkflowOutputs } from '@/lib/domain/storyboard/service'
import { resolveProjectDirectorStyleDoc } from '@/lib/style-preset'
import { canonicalizeStoryboardPanels } from '@/lib/storyboard-character-bindings'

type AnyObj = Record<string, unknown>

function buildWorkflowWorkerId(job: Job<TaskJobData>, label: string) {
  return `${label}:${job.queueName}:${job.data.taskId}`
}

function readAssetKind(value: Record<string, unknown>): string {
  return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

function readNullableText(value: Record<string, unknown>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' ? field : null
}

function isReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
}

function resolveStoryboardStepSkillId(stepId: string): string {
  if (stepId === 'voice_analyze') return 'generate-voice-lines'
  if (stepId.endsWith('_phase1')) return 'plan-storyboard-phase1'
  if (stepId.endsWith('_phase2_cinematography')) return 'refine-cinematography'
  if (stepId.endsWith('_phase2_acting')) return 'refine-acting'
  if (stepId.endsWith('_phase3_detail')) return 'refine-storyboard-detail'
  return stepId
}

function resolveStoryboardStepScopeRef(stepId: string, episodeId: string): string {
  if (stepId === 'voice_analyze') return `episode:${episodeId}`
  const matched = /^clip_(.+)_(phase1|phase2_cinematography|phase2_acting|phase3_detail)$/.exec(stepId)
  if (matched?.[1]) {
    return `clip:${matched[1]}`
  }
  return `episode:${episodeId}`
}

function canonicalizeStoryboardPanelMap(
  panelsByClipId: Record<string, import('@/lib/storyboard-phases').StoryboardPanel[]> | undefined,
  characters: Parameters<typeof canonicalizeStoryboardPanels>[1],
  context: string,
) {
  const next: Record<string, import('@/lib/storyboard-phases').StoryboardPanel[]> = {}
  for (const [clipId, panels] of Object.entries(panelsByClipId || {})) {
    next[clipId] = canonicalizeStoryboardPanels(panels, characters, `${context}:${clipId}`)
  }
  return next
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
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }

  // Register project name for per-project log file routing
  onProjectNameAvailable(projectId, project.name)

  const projectWorkflow = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: true,
    },
  })
  if (!projectWorkflow) throw new Error('Project not found')
  const directorStyleDoc = await resolveProjectDirectorStyleDoc({
    projectId,
    userId: job.data.userId,
  })

  const episode = await prisma.projectEpisode.findUnique({
    where: { id: episodeId },
    include: {
      clips: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!episode || episode.projectId !== projectId) {
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
    projectAnalysisModel: projectWorkflow.analysisModel,
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
  const locale: SkillLocale = job.data.locale === 'en' ? 'en' : 'zh'
  const payloadMeta = typeof payload.meta === 'object' && payload.meta !== null
    ? (payload.meta as AnyObj)
    : {}
  const runId = typeof payload.runId === 'string' && payload.runId.trim()
    ? payload.runId.trim()
    : (typeof payloadMeta.runId === 'string' ? payloadMeta.runId.trim() : '')
  if (!runId) {
    throw new Error('runId is required for script_to_storyboard pipeline')
  }
  const mutationContext = {
    actor: 'workflow' as const,
    workflowId: 'script-to-storyboard' as const,
    runId,
    commandId: typeof payload.commandId === 'string' && payload.commandId.trim() ? payload.commandId.trim() : null,
    planId: typeof payload.planId === 'string' && payload.planId.trim() ? payload.planId.trim() : null,
    taskId: job.data.taskId,
    idempotencyKey: `${runId}:${retryStepKey || 'full'}`,
  }
  const workerId = buildWorkflowWorkerId(job, 'script_to_storyboard')
  const assertRunActive = async (stage: string) => {
    await assertWorkflowRunActive({
      runId,
      workerId,
      stage,
    })
  }
  const streamContext = createWorkerLLMStreamContext(job, 'script_to_storyboard')
  const callbacks = createWorkerLLMStreamCallbacks(job, streamContext, {
    assertActive: async (stage) => {
      await assertRunActive(stage)
    },
    isActive: async () => {
      try {
        await assertRunActive('worker_llm_stream_probe')
        return true
      } catch (error) {
        if (error instanceof TaskTerminatedError) {
          return false
        }
        throw error
      }
    },
  })

  const runStep = async (
    meta: ScriptToStoryboardStepMeta,
    prompt: string,
    action: string,
    _maxOutputTokens: number,
  ): Promise<ScriptToStoryboardStepOutput> => {
    void _maxOutputTokens
    const stepAttempt = meta.stepAttempt
      || (retryStepKey && meta.stepId === retryStepKey ? retryStepAttempt : 1)
    const skillId = resolveStoryboardStepSkillId(meta.stepId)
    const scopeRef = resolveStoryboardStepScopeRef(meta.stepId, episodeId)
    await assertRunActive(`script_to_storyboard_step:${meta.stepId}`)
    const progress = 15 + Math.min(70, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 70))
    await reportTaskProgress(job, progress, {
      stage: 'script_to_storyboard_step',
      stageLabel: 'progress.stage.scriptToStoryboardStep',
      displayMode: 'detail',
      message: meta.stepTitle,
      stepId: meta.stepId,
      stepAttempt,
      stepTitle: meta.stepTitle,
      skillId,
      scopeRef,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
      dependsOn: Array.isArray(meta.dependsOn) ? meta.dependsOn : [],
      groupId: meta.groupId || null,
      parallelKey: meta.parallelKey || null,
      retryable: meta.retryable !== false,
      blockedBy: Array.isArray(meta.blockedBy) ? meta.blockedBy : [],
    })

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
    await callbacks.flush()

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

  const leaseResult = await withWorkflowRunLease({
    runId,
    userId: job.data.userId,
    workerId,
    run: async () => {
      await reportTaskProgress(job, 10, {
        stage: 'script_to_storyboard_prepare',
        stageLabel: 'progress.stage.scriptToStoryboardPrepare',
        displayMode: 'detail',
      })

      const orchestratorResult: ScriptToStoryboardWorkflowResult = await (async () => {
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
                  locale,
                  clip: {
                    id: clip.id,
                    content: clip.content,
                    characters: clip.characters,
                    location: clip.location,
                    props: readNullableText(clip as unknown as Record<string, unknown>, 'props'),
                    screenplay: clip.screenplay,
                  },
                  clipIndex,
                  totalClipCount: clips.length,
                  projectData: {
                    characters: projectWorkflow.characters || [],
                    locations: (projectWorkflow.locations || []).filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop'),
                    props: (projectWorkflow.locations || [])
                      .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
                      .map((item) => ({ name: item.name, summary: item.summary })),
                    directorStyleDoc,
                  },
                  runStep,
                })
                return {
                  clipPanels: atomicResult.clipPanels,
                  phase1PanelsByClipId: atomicResult.phase1PanelsByClipId,
                  phase2CinematographyByClipId: atomicResult.phase2CinematographyByClipId,
                  phase2ActingByClipId: atomicResult.phase2ActingByClipId,
                  phase3PanelsByClipId: atomicResult.phase3PanelsByClipId,
                  voiceLineRows: [],
                  summary: {
                    clipCount: selectedClips.length,
                    totalPanelCount: atomicResult.totalPanelCount,
                    totalStepCount: atomicResult.totalStepCount,
                  },
                }
              }

              try {
                return await runScriptToStoryboardSkillWorkflow({
                  concurrency: workflowConcurrency.analysis,
                  locale,
                  clips: selectedClips.map((clip) => ({
                    id: clip.id,
                    content: clip.content,
                    characters: clip.characters,
                    location: clip.location,
                    props: readNullableText(clip as unknown as Record<string, unknown>, 'props'),
                    screenplay: clip.screenplay,
                  })),
                  projectData: {
                    characters: projectWorkflow.characters || [],
                    locations: (projectWorkflow.locations || []).filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop'),
                    props: (projectWorkflow.locations || [])
                      .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
                      .map((item) => ({ name: item.name, summary: item.summary })),
                    directorStyleDoc,
                  },
                  novelText: episode.novelText || '',
                  runStep,
                })
              } catch (error) {
                if (error instanceof SkillJsonParseError) {
                  logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
                    action: 'SCRIPT_TO_STORYBOARD_PARSE_ERROR',
                    error: {
                      message: error.message,
                      rawTextPreview: error.rawText.slice(0, 3000),
                      rawTextLength: error.rawText.length,
                    },
                    model,
                  })
                }
                throw error
              }
            },
          )
        } finally {
          await callbacks.flush()
        }
      })()

      const canonicalClipPanels = (orchestratorResult.clipPanels || []).map((clipEntry) => ({
        ...clipEntry,
        finalPanels: canonicalizeStoryboardPanels(
          clipEntry.finalPanels || [],
          projectWorkflow.characters || [],
          `workflow:${clipEntry.clipId}:final`,
        ),
      }))
      orchestratorResult.clipPanels = canonicalClipPanels
      orchestratorResult.phase1PanelsByClipId = canonicalizeStoryboardPanelMap(
        orchestratorResult.phase1PanelsByClipId,
        projectWorkflow.characters || [],
        'workflow:phase1',
      )
      orchestratorResult.phase3PanelsByClipId = canonicalizeStoryboardPanelMap(
        orchestratorResult.phase3PanelsByClipId,
        projectWorkflow.characters || [],
        'workflow:phase3',
      )

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
      await assertRunActive('script_to_storyboard_persist')

      if (skipVoiceAnalyze) {
        const persisted = await persistStoryboardWorkflowOutputs({
          episodeId,
          clipPanels: orchestratorResult.clipPanels,
          voiceLineRows: null,
          mutation: mutationContext,
        })
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
          storyboardCount: persisted.persistedStoryboards.length,
          panelCount: orchestratorResult.summary.totalPanelCount,
          voiceLineCount: 0,
          retryStepKey,
        }
      }

      await createArtifact({
        runId,
        stepKey: 'voice_analyze',
        artifactType: 'voice.lines',
        refId: episodeId,
        payload: {
          lines: orchestratorResult.voiceLineRows,
        },
      })

      await assertRunActive('script_to_storyboard_voice_persist')
      const persisted = await persistStoryboardWorkflowOutputs({
        episodeId,
        clipPanels: orchestratorResult.clipPanels,
        voiceLineRows: orchestratorResult.voiceLineRows,
        mutation: mutationContext,
      })

      await reportTaskProgress(job, 96, {
        stage: 'script_to_storyboard_persist_done',
        stageLabel: 'progress.stage.scriptToStoryboardPersistDone',
        displayMode: 'detail',
      })

      return {
        episodeId,
        storyboardCount: persisted.persistedStoryboards.length,
        panelCount: orchestratorResult.summary.totalPanelCount,
        voiceLineCount: persisted.voiceLineCount,
      }
    },
  })

  if (!leaseResult.claimed || !leaseResult.result) {
    return {
      runId,
      skipped: true,
      episodeId,
    }
  }

  return leaseResult.result
}
