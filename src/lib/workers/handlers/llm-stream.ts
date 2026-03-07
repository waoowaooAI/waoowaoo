import type { Job } from 'bullmq'
import { type InternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import type { LLMStreamKind } from '@/lib/llm-observe/types'
import { TaskTerminatedError } from '@/lib/task/errors'
import { isTaskActive } from '@/lib/task/service'
import { reportTaskProgress, reportTaskStreamChunk } from '@/lib/workers/shared'
import type { TaskJobData } from '@/lib/task/types'
import { assertTaskActive } from '@/lib/workers/utils'

export type WorkerLLMStreamContext = {
  streamRunId: string
  nextSeqByStepLane: Record<string, number>
}

export type WorkerInternalLLMStreamCallbacks = InternalLLMStreamCallbacks & {
  flush: () => Promise<void>
}

export function createWorkerLLMStreamContext(job: Job<TaskJobData>, label = 'worker'): WorkerLLMStreamContext {
  return {
    streamRunId: `run:${job.data.taskId}:${label}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    nextSeqByStepLane: {},
  }
}

function nextWorkerStreamSeq(streamContext: WorkerLLMStreamContext, stepId: string | null, lane: string) {
  const key = `${stepId || '__default'}|${lane || 'main'}`
  const current = streamContext.nextSeqByStepLane[key] || 1
  streamContext.nextSeqByStepLane[key] = current + 1
  return current
}

export function createWorkerLLMStreamCallbacks(
  job: Job<TaskJobData>,
  streamContext: WorkerLLMStreamContext,
): WorkerInternalLLMStreamCallbacks {
  const maxChunkChars = 128
  const activeProbeIntervalMs = 600
  let publishQueue: Promise<void> = Promise.resolve()
  let terminatedError: TaskTerminatedError | null = null
  let checkingActive = false
  let lastActiveProbeAt = 0

  const markTerminated = (stage: string) => {
    if (terminatedError) return
    terminatedError = new TaskTerminatedError(
      job.data.taskId,
      `Task terminated during ${stage}`,
    )
  }

  const ensureActiveOrThrow = (stage: string) => {
    void stage
    if (terminatedError) throw terminatedError
  }

  const scheduleActiveProbe = () => {
    if (terminatedError || checkingActive) return
    const now = Date.now()
    if (now - lastActiveProbeAt < activeProbeIntervalMs) return
    checkingActive = true
    lastActiveProbeAt = now
    void isTaskActive(job.data.taskId)
      .then((active) => {
        if (!active) {
          markTerminated('worker_llm_stream_probe')
        }
      })
      .finally(() => {
        checkingActive = false
      })
  }

  const enqueue = (stage: string, work: () => Promise<void>) => {
    ensureActiveOrThrow(stage)
    scheduleActiveProbe()
    publishQueue = publishQueue
      .catch(() => undefined)
      .then(async () => {
        ensureActiveOrThrow(stage)
        await assertTaskActive(job, stage)
        await work()
      })
      .catch((error) => {
        if (error instanceof TaskTerminatedError) {
          markTerminated(stage)
          return
        }
        throw error
      })
  }

  return {
    onStage: ({ stage, provider, step }) => {
      ensureActiveOrThrow(`worker_llm_stage:${stage}`)
      scheduleActiveProbe()
      const stageLabel =
        stage === 'submit'
          ? 'progress.runtime.stage.llmSubmit'
          : stage === 'streaming'
            ? 'progress.runtime.stage.llmStreaming'
            : stage === 'fallback'
              ? 'progress.runtime.stage.llmFallbackNonStream'
              : 'progress.runtime.stage.llmCompleted'
      const stageKey = `worker_llm_${stage}`
      const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
      const stepAttempt =
        typeof step?.attempt === 'number' && Number.isFinite(step.attempt)
          ? Math.max(1, Math.floor(step.attempt))
          : null
      const stepTitle = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
      const stepIndex =
        typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
      const stepTotal =
        typeof step?.total === 'number' && Number.isFinite(step.total)
          ? Math.max(stepIndex || 1, Math.floor(step.total))
          : null
      enqueue(`worker_llm_stage:${stage}`, async () => {
        await reportTaskProgress(job, 65, {
          stage: stageKey,
          stageLabel,
          displayMode: 'detail',
          message: stageLabel,
          streamRunId: streamContext.streamRunId,
          ...(stepId ? { stepId } : {}),
          ...(stepAttempt ? { stepAttempt } : {}),
          ...(stepTitle ? { stepTitle } : {}),
          ...(stepIndex ? { stepIndex } : {}),
          ...(stepTotal ? { stepTotal } : {}),
          meta: {
            provider: provider || null,
          },
        })
      })
    },
    onChunk: ({ kind, delta, lane, step }) => {
      ensureActiveOrThrow('worker_llm_stream')
      scheduleActiveProbe()
      if (!delta) return
      const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
      const stepAttempt =
        typeof step?.attempt === 'number' && Number.isFinite(step.attempt)
          ? Math.max(1, Math.floor(step.attempt))
          : null
      const stepTitle = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
      const stepIndex =
        typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
      const stepTotal =
        typeof step?.total === 'number' && Number.isFinite(step.total)
          ? Math.max(stepIndex || 1, Math.floor(step.total))
          : null
      const laneKey = lane || (kind === 'reasoning' ? 'reasoning' : 'main')
      for (let i = 0; i < delta.length; i += maxChunkChars) {
        const piece = delta.slice(i, i + maxChunkChars)
        if (!piece) continue
        enqueue('worker_llm_stream', async () => {
          await reportTaskStreamChunk(
            job,
            {
              kind: kind as LLMStreamKind,
              delta: piece,
              seq: nextWorkerStreamSeq(streamContext, stepId, laneKey),
              lane: laneKey,
            },
            {
              stage: 'worker_llm_stream',
              stageLabel: 'progress.runtime.stage.llmStreaming',
              displayMode: 'detail',
              done: false,
              message: kind === 'reasoning' ? 'progress.runtime.llm.reasoning' : 'progress.runtime.llm.output',
              streamRunId: streamContext.streamRunId,
              ...(stepId ? { stepId } : {}),
              ...(stepAttempt ? { stepAttempt } : {}),
              ...(stepTitle ? { stepTitle } : {}),
              ...(stepIndex ? { stepIndex } : {}),
              ...(stepTotal ? { stepTotal } : {}),
            },
          )
        })
      }
    },
    onComplete: (text, step) => {
      ensureActiveOrThrow('worker_llm_complete')
      const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
      const stepAttempt =
        typeof step?.attempt === 'number' && Number.isFinite(step.attempt)
          ? Math.max(1, Math.floor(step.attempt))
          : null
      const stepTitle = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
      const stepIndex =
        typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
      const stepTotal =
        typeof step?.total === 'number' && Number.isFinite(step.total)
          ? Math.max(stepIndex || 1, Math.floor(step.total))
          : null
      enqueue('worker_llm_complete', async () => {
        await reportTaskProgress(job, 90, {
          stage: 'worker_llm_complete',
          stageLabel: 'progress.runtime.stage.llmCompleted',
          displayMode: 'detail',
          message: 'progress.runtime.llm.completed',
          done: true,
          ...(typeof text === 'string' ? { output: text } : {}),
          streamRunId: streamContext.streamRunId,
          ...(stepId ? { stepId } : {}),
          ...(stepAttempt ? { stepAttempt } : {}),
          ...(stepTitle ? { stepTitle } : {}),
          ...(stepIndex ? { stepIndex } : {}),
          ...(stepTotal ? { stepTotal } : {}),
        })
      })
    },
    onError: (error, step) => {
      if (error instanceof TaskTerminatedError) {
        markTerminated('worker_llm_error')
        throw error
      }
      ensureActiveOrThrow('worker_llm_error')
      const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
      const stepAttempt =
        typeof step?.attempt === 'number' && Number.isFinite(step.attempt)
          ? Math.max(1, Math.floor(step.attempt))
          : null
      const stepTitle = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
      const stepIndex =
        typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
      const stepTotal =
        typeof step?.total === 'number' && Number.isFinite(step.total)
          ? Math.max(stepIndex || 1, Math.floor(step.total))
          : null
      enqueue('worker_llm_error', async () => {
        await reportTaskProgress(job, 90, {
          stage: 'worker_llm_error',
          stageLabel: 'progress.runtime.stage.llmFailed',
          displayMode: 'detail',
          message: error instanceof Error ? error.message : String(error),
          streamRunId: streamContext.streamRunId,
          ...(stepId ? { stepId } : {}),
          ...(stepAttempt ? { stepAttempt } : {}),
          ...(stepTitle ? { stepTitle } : {}),
          ...(stepIndex ? { stepIndex } : {}),
          ...(stepTotal ? { stepTotal } : {}),
        })
      })
    },
    async flush() {
      await publishQueue.catch(() => undefined)
      if (terminatedError) {
        throw terminatedError
      }
    },
  }
}
