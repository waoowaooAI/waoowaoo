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
})
