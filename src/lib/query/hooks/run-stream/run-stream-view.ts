import { getStageOutput, toStageViewStatus } from './state-machine'
import type { RunStageView, RunState, RunStepState } from './types'

export type DerivedRunStreamView = {
  orderedSteps: RunStepState[]
  activeStepId: string | null
  selectedStep: RunStepState | null
  outputText: string
  stages: RunStageView[]
  overallProgress: number
  activeMessage: string
  isVisible: boolean
}

export function deriveRunStreamView(args: {
  runState: RunState | null
  isLiveRunning: boolean
  clock: number
}): DerivedRunStreamView {
  const { runState, isLiveRunning, clock } = args
  const orderedSteps = runState
    ? runState.stepOrder
        .map((id) => runState.stepsById[id])
        .filter((item): item is RunStepState => !!item)
    : []

  const activeStepId = runState?.activeStepId || orderedSteps[orderedSteps.length - 1]?.id || null
  const activeStep =
    activeStepId && runState?.stepsById[activeStepId]
      ? runState.stepsById[activeStepId]
      : orderedSteps[orderedSteps.length - 1] || null
  const selectedStepId = runState?.selectedStepId || activeStepId
  const selectedStep =
    selectedStepId && runState?.stepsById[selectedStepId]
      ? runState.stepsById[selectedStepId]
      : orderedSteps[orderedSteps.length - 1] || null

  const outputText = (() => {
    const stepOutput = getStageOutput(selectedStep)
    if (stepOutput) return stepOutput
    if (runState?.status === 'failed' && runState.errorMessage) {
      return `【错误】\n${runState.errorMessage}`
    }
    return ''
  })()

  const stages: RunStageView[] = orderedSteps.map((step) => ({
    id: step.id,
    title: step.title,
    subtitle: (() => {
      const relationText =
        step.status === 'blocked' && step.blockedBy.length > 0
          ? `等待: ${step.blockedBy.join(', ')}`
          : step.dependsOn.length > 0
            ? `依赖: ${step.dependsOn.join(', ')}`
            : ''
      const parallelText = step.groupId && step.parallelKey
        ? `并行组: ${step.groupId}/${step.parallelKey}`
        : ''
      const parts = [relationText, parallelText, step.message || ''].filter(Boolean)
      return parts.length > 0 ? parts.join(' | ') : undefined
    })(),
    status: toStageViewStatus(step.status),
    attempt: step.attempt,
    retryable: step.retryable,
    progress:
      step.status === 'completed'
        ? 100
        : step.status === 'stale'
          ? 100
          : step.status === 'blocked'
            ? 0
        : step.status === 'running'
          ? Math.max(2, Math.min(99, step.textLength > 0 || step.reasoningLength > 0 ? 15 : 2))
          : 0,
  }))

  const overallProgress =
    stages.length === 0
      ? 0
      : stages.reduce((sum, stage) => {
          if (stage.status === 'completed') return sum + 100
          if (stage.status === 'stale') return sum + 100
          if (stage.status === 'blocked') return sum
          if (stage.status === 'failed') return sum
          return sum + (stage.progress || 0)
        }, 0) / stages.length

  const activeMessage = !activeStep
    ? runState?.status === 'failed'
      ? runState.errorMessage
      : 'progress.runtime.waitingExecution'
    : activeStep.errorMessage
      ? activeStep.errorMessage
      : activeStep.status === 'completed'
        ? 'progress.runtime.llm.completed'
        : activeStep.status === 'failed'
          ? 'progress.runtime.llm.failed'
          : activeStep.status === 'blocked'
            ? activeStep.blockedBy.length > 0
              ? `等待依赖步骤: ${activeStep.blockedBy.join(', ')}`
              : 'progress.runtime.waitingExecution'
            : activeStep.status === 'stale'
              ? '结果已过期，请按需重试'
          : activeStep.message || 'progress.runtime.llm.processing'

  void clock
  const isVisible = !!runState && (
    isLiveRunning ||
    runState.status === 'running' ||
    runState.status === 'failed'
  )

  return {
    orderedSteps,
    activeStepId,
    selectedStep,
    outputText,
    stages,
    overallProgress,
    activeMessage,
    isVisible,
  }
}
