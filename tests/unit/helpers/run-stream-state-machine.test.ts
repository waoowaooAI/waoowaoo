import { describe, expect, it } from 'vitest'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { applyRunStreamEvent, getStageOutput } from '@/lib/query/hooks/run-stream/state-machine'

function applySequence(events: RunStreamEvent[]) {
  let state = null
  for (const event of events) {
    state = applyRunStreamEvent(state, event)
  }
  return state
}

describe('run stream state-machine', () => {
  it('marks unfinished steps as failed when run.error arrives', () => {
    const runId = 'run-1'
    const state = applySequence([
      { runId, event: 'run.start', ts: '2026-02-26T23:00:00.000Z', status: 'running' },
      {
        runId,
        event: 'step.start',
        ts: '2026-02-26T23:00:01.000Z',
        status: 'running',
        stepId: 'step-a',
        stepTitle: 'A',
        stepIndex: 1,
        stepTotal: 2,
      },
      {
        runId,
        event: 'step.complete',
        ts: '2026-02-26T23:00:02.000Z',
        status: 'completed',
        stepId: 'step-b',
        stepTitle: 'B',
        stepIndex: 2,
        stepTotal: 2,
        text: 'ok',
      },
      {
        runId,
        event: 'run.error',
        ts: '2026-02-26T23:00:03.000Z',
        status: 'failed',
        message: 'exception TypeError: fetch failed sending request',
      },
    ])

    expect(state?.status).toBe('failed')
    expect(state?.stepsById['step-a']?.status).toBe('failed')
    expect(state?.stepsById['step-a']?.errorMessage).toContain('fetch failed')
    expect(state?.stepsById['step-b']?.status).toBe('completed')
  })

  it('returns readable error output for failed step without stream text', () => {
    const output = getStageOutput({
      id: 'step-failed',
      attempt: 1,
      title: 'failed',
      stepIndex: 1,
      stepTotal: 1,
      status: 'failed',
      textOutput: '',
      reasoningOutput: '',
      textLength: 0,
      reasoningLength: 0,
      message: '',
      errorMessage: 'exception TypeError: fetch failed sending request',
      updatedAt: Date.now(),
      seqByLane: {
        text: 0,
        reasoning: 0,
      },
    })

    expect(output).toContain('【错误】')
    expect(output).toContain('fetch failed sending request')
  })

  it('merges retry attempts into one step instead of duplicating stage entries', () => {
    const runId = 'run-2'
    const state = applySequence([
      { runId, event: 'run.start', ts: '2026-02-26T23:00:00.000Z', status: 'running' },
      {
        runId,
        event: 'step.start',
        ts: '2026-02-26T23:00:01.000Z',
        status: 'running',
        stepId: 'clip_x_phase1',
        stepTitle: 'A',
        stepIndex: 1,
        stepTotal: 1,
      },
      {
        runId,
        event: 'step.chunk',
        ts: '2026-02-26T23:00:01.100Z',
        status: 'running',
        stepId: 'clip_x_phase1',
        lane: 'text',
        seq: 1,
        textDelta: 'first-attempt',
      },
      {
        runId,
        event: 'step.start',
        ts: '2026-02-26T23:00:02.000Z',
        status: 'running',
        stepId: 'clip_x_phase1_r2',
        stepTitle: 'A',
        stepIndex: 1,
        stepTotal: 1,
      },
      {
        runId,
        event: 'step.chunk',
        ts: '2026-02-26T23:00:02.100Z',
        status: 'running',
        stepId: 'clip_x_phase1_r2',
        lane: 'text',
        seq: 1,
        textDelta: 'retry-output',
      },
    ])

    expect(state?.stepOrder).toEqual(['clip_x_phase1'])
    expect(state?.stepsById['clip_x_phase1']?.attempt).toBe(2)
    expect(state?.stepsById['clip_x_phase1']?.textOutput).toBe('retry-output')
  })

  it('resets step output when a higher stepAttempt starts and ignores stale lower attempt chunks', () => {
    const runId = 'run-3'
    const state = applySequence([
      { runId, event: 'run.start', ts: '2026-02-26T23:00:00.000Z', status: 'running' },
      {
        runId,
        event: 'step.start',
        ts: '2026-02-26T23:00:01.000Z',
        status: 'running',
        stepId: 'clip_y_phase1',
        stepAttempt: 1,
        stepTitle: 'A',
        stepIndex: 1,
        stepTotal: 1,
      },
      {
        runId,
        event: 'step.chunk',
        ts: '2026-02-26T23:00:01.100Z',
        status: 'running',
        stepId: 'clip_y_phase1',
        stepAttempt: 1,
        lane: 'text',
        seq: 1,
        textDelta: 'old-output',
      },
      {
        runId,
        event: 'step.start',
        ts: '2026-02-26T23:00:02.000Z',
        status: 'running',
        stepId: 'clip_y_phase1',
        stepAttempt: 2,
        stepTitle: 'A',
        stepIndex: 1,
        stepTotal: 1,
      },
      {
        runId,
        event: 'step.chunk',
        ts: '2026-02-26T23:00:02.100Z',
        status: 'running',
        stepId: 'clip_y_phase1',
        stepAttempt: 1,
        lane: 'text',
        seq: 2,
        textDelta: 'should-be-ignored',
      },
      {
        runId,
        event: 'step.chunk',
        ts: '2026-02-26T23:00:02.200Z',
        status: 'running',
        stepId: 'clip_y_phase1',
        stepAttempt: 2,
        lane: 'text',
        seq: 1,
        textDelta: 'new-output',
      },
    ])

    expect(state?.stepsById['clip_y_phase1']?.attempt).toBe(2)
    expect(state?.stepsById['clip_y_phase1']?.textOutput).toBe('new-output')
  })

  it('reopens completed step when late chunk arrives, then finalizes on run.complete', () => {
    const runId = 'run-4'
    const state = applySequence([
      { runId, event: 'run.start', ts: '2026-02-26T23:00:00.000Z', status: 'running' },
      {
        runId,
        event: 'step.start',
        ts: '2026-02-26T23:00:01.000Z',
        status: 'running',
        stepId: 'analyze_characters',
        stepTitle: 'characters',
        stepIndex: 1,
        stepTotal: 2,
      },
      {
        runId,
        event: 'step.complete',
        ts: '2026-02-26T23:00:02.000Z',
        status: 'completed',
        stepId: 'analyze_characters',
        stepTitle: 'characters',
        stepIndex: 1,
        stepTotal: 2,
        text: 'partial',
      },
      {
        runId,
        event: 'step.chunk',
        ts: '2026-02-26T23:00:02.100Z',
        status: 'running',
        stepId: 'analyze_characters',
        lane: 'text',
        seq: 2,
        textDelta: '-tail',
      },
      {
        runId,
        event: 'run.complete',
        ts: '2026-02-26T23:00:03.000Z',
        status: 'completed',
        payload: { ok: true },
      },
    ])

    expect(state?.status).toBe('completed')
    expect(state?.stepsById['analyze_characters']?.status).toBe('completed')
    expect(state?.stepsById['analyze_characters']?.textOutput).toBe('partial-tail')
  })

  it('moves activeStepId to the latest step when no step is running', () => {
    const runId = 'run-5'
    const state = applySequence([
      { runId, event: 'run.start', ts: '2026-02-26T23:00:00.000Z', status: 'running' },
      {
        runId,
        event: 'step.complete',
        ts: '2026-02-26T23:00:01.000Z',
        status: 'completed',
        stepId: 'step-1',
        stepTitle: 'step 1',
        stepIndex: 1,
        stepTotal: 2,
        text: 'a',
      },
      {
        runId,
        event: 'step.complete',
        ts: '2026-02-26T23:00:02.000Z',
        status: 'completed',
        stepId: 'step-2',
        stepTitle: 'step 2',
        stepIndex: 2,
        stepTotal: 2,
        text: 'b',
      },
    ])

    expect(state?.activeStepId).toBe('step-2')
  })
})
