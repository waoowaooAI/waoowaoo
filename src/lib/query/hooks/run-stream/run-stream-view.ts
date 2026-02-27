import { getStageOutput, toStageViewStatus } from './state-machine'
import type { RunStageView, RunState, RunStepState } from './types'

const TERMINAL_VISIBLE_MS = 5_000

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
    subtitle: step.message || undefined,
    status: toStageViewStatus(step.status),
    progress:
      step.status === 'completed'
        ? 100
        : step.status === 'running'
          ? Math.max(2, Math.min(99, step.textLength > 0 || step.reasoningLength > 0 ? 15 : 2))
          : 0,
  }))

  const overallProgress =
    stages.length === 0
      ? 0
      : stages.reduce((sum, stage) => {
          if (stage.status === 'completed') return sum + 100
          if (stage.status === 'failed') return sum
          return sum + (stage.progress || 0)
        }, 0) / stages.length

  const activeMessage = !selectedStep
    ? runState?.status === 'failed'
      ? runState.errorMessage
      : 'progress.runtime.waitingExecution'
    : selectedStep.errorMessage
      ? selectedStep.errorMessage
      : selectedStep.status === 'completed'
        ? 'progress.runtime.llm.completed'
        : selectedStep.status === 'failed'
          ? 'progress.runtime.llm.failed'
          : selectedStep.message || 'progress.runtime.llm.processing'

  const isVisible =
    !!runState &&
    (
      isLiveRunning ||
      runState.status === 'running' ||
      (runState.terminalAt !== null && clock - runState.terminalAt <= TERMINAL_VISIBLE_MS)
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
