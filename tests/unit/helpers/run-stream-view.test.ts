import { describe, expect, it } from 'vitest'
import { deriveRunStreamView } from '@/lib/query/hooks/run-stream/run-stream-view'
import type { RunState, RunStepState } from '@/lib/query/hooks/run-stream/types'

function buildStep(overrides: Partial<RunStepState> = {}): RunStepState {
  return {
    id: 'step-1',
    attempt: 1,
    title: 'step',
    stepIndex: 1,
    stepTotal: 1,
    status: 'running',
    dependsOn: [],
    blockedBy: [],
    groupId: null,
    parallelKey: null,
    retryable: true,
    textOutput: '',
    reasoningOutput: '',
    textLength: 0,
    reasoningLength: 0,
    message: '',
    errorMessage: '',
    updatedAt: Date.now(),
    seqByLane: {
      text: 0,
      reasoning: 0,
    },
    ...overrides,
  }
}

function buildRunState(overrides: Partial<RunState> = {}): RunState {
  const baseStep = buildStep()
  return {
    runId: 'run-1',
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    terminalAt: null,
    errorMessage: '',
    summary: null,
    payload: null,
    stepsById: {
      [baseStep.id]: baseStep,
    },
    stepOrder: [baseStep.id],
    activeStepId: baseStep.id,
    selectedStepId: baseStep.id,
    ...overrides,
  }
}

describe('run stream view', () => {
  it('keeps console visible for recovered running state', () => {
    const state = buildRunState({
      status: 'running',
      terminalAt: null,
    })

    const view = deriveRunStreamView({
      runState: state,
      isLiveRunning: false,
      clock: Date.now(),
    })

    expect(view.isVisible).toBe(true)
  })

  it('shows run error in output when run failed and selected step has no output', () => {
    const state = buildRunState({
      status: 'failed',
      errorMessage: 'exception TypeError: fetch failed sending request',
      stepsById: {
        'step-1': buildStep({ status: 'running' }),
      },
    })

    const view = deriveRunStreamView({
      runState: state,
      isLiveRunning: false,
      clock: Date.now(),
    })

    expect(view.outputText).toContain('【错误】')
    expect(view.outputText).toContain('fetch failed sending request')
  })

  it('shows run error in output when run failed before any step starts', () => {
    const state = buildRunState({
      status: 'failed',
      errorMessage: 'NETWORK_ERROR',
      stepsById: {},
      stepOrder: [],
      activeStepId: null,
      selectedStepId: null,
    })

    const view = deriveRunStreamView({
      runState: state,
      isLiveRunning: false,
      clock: Date.now(),
    })

    expect(view.outputText).toBe('【错误】\nNETWORK_ERROR')
  })

  it('keeps failed run visible until user reset', () => {
    const state = buildRunState({
      status: 'failed',
      terminalAt: Date.now() - 60_000,
      errorMessage: 'failed',
    })

    const view = deriveRunStreamView({
      runState: state,
      isLiveRunning: false,
      clock: Date.now(),
    })

    expect(view.isVisible).toBe(true)
  })

  it('hides completed run console after stream settles', () => {
    const state = buildRunState({
      status: 'completed',
      terminalAt: Date.now() - 30_000,
    })

    const view = deriveRunStreamView({
      runState: state,
      isLiveRunning: false,
      clock: Date.now(),
    })

    expect(view.isVisible).toBe(false)
  })

  it('uses active step message instead of selected completed step message', () => {
    const completedStep = buildStep({
      id: 'step-1',
      title: 'step 1',
      status: 'completed',
      message: 'progress.runtime.llm.completed',
      updatedAt: Date.now() - 1000,
    })
    const runningStep = buildStep({
      id: 'step-2',
      title: 'step 2',
      stepIndex: 2,
      stepTotal: 2,
      status: 'running',
      message: 'progress.runtime.stage.llmStreaming',
      updatedAt: Date.now(),
    })
    const state = buildRunState({
      stepsById: {
        'step-1': completedStep,
        'step-2': runningStep,
      },
      stepOrder: ['step-1', 'step-2'],
      activeStepId: 'step-2',
      selectedStepId: 'step-1',
    })

    const view = deriveRunStreamView({
      runState: state,
      isLiveRunning: false,
      clock: Date.now(),
    })

    expect(view.activeMessage).toBe('progress.runtime.stage.llmStreaming')
  })
})
