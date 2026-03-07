import { describe, expect, it } from 'vitest'
import { mapTaskSSEEventToRunEvents } from '@/lib/run-runtime/task-bridge'
import { RUN_EVENT_TYPE } from '@/lib/run-runtime/types'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'

function buildEvent(input: Partial<SSEEvent>): SSEEvent {
  return {
    id: input.id || '1',
    type: input.type || TASK_SSE_EVENT_TYPE.LIFECYCLE,
    taskId: input.taskId || 'task_1',
    projectId: input.projectId || 'project_1',
    userId: input.userId || 'user_1',
    ts: input.ts || new Date().toISOString(),
    payload: input.payload || {},
    taskType: input.taskType || null,
    targetType: input.targetType || null,
    targetId: input.targetId || null,
    episodeId: input.episodeId || null,
  }
}

describe('task->run event bridge', () => {
  it('maps task.stream to step.chunk and normalizes lane by kind', () => {
    const event = buildEvent({
      type: TASK_SSE_EVENT_TYPE.STREAM,
      payload: {
        runId: 'run_1',
        stepId: 'step_a',
        stream: {
          kind: 'reasoning',
          delta: 'abc',
          seq: 1,
        },
      },
    })

    const mapped = mapTaskSSEEventToRunEvents(event)
    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      runId: 'run_1',
      eventType: RUN_EVENT_TYPE.STEP_CHUNK,
      stepKey: 'step_a',
      lane: 'reasoning',
    })
  })

  it('uses taskType-based fallback stepKey for stream when stepId missing', () => {
    const event = buildEvent({
      type: TASK_SSE_EVENT_TYPE.STREAM,
      taskType: 'story_to_script_run',
      payload: {
        runId: 'run_1',
        stream: {
          kind: 'text',
          delta: 'hello',
          seq: 1,
        },
      },
    })

    const mapped = mapTaskSSEEventToRunEvents(event)
    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({
      eventType: RUN_EVENT_TYPE.STEP_CHUNK,
      stepKey: 'step:story_to_script_run',
      lane: 'text',
    })
  })

  it('maps task.processing + done=true to step.start then step.complete', () => {
    const event = buildEvent({
      payload: {
        runId: 'run_2',
        stepId: 'step_b',
        lifecycleType: TASK_EVENT_TYPE.PROCESSING,
        done: true,
      },
    })

    const mapped = mapTaskSSEEventToRunEvents(event)
    expect(mapped).toHaveLength(2)
    expect(mapped[0]?.eventType).toBe(RUN_EVENT_TYPE.STEP_START)
    expect(mapped[1]?.eventType).toBe(RUN_EVENT_TYPE.STEP_COMPLETE)
  })

  it('maps processing error stage to step.error', () => {
    const event = buildEvent({
      payload: {
        meta: { runId: 'run_3' },
        stepId: 'step_c',
        lifecycleType: TASK_EVENT_TYPE.PROCESSING,
        stage: 'worker_llm_error',
        error: {
          message: 'boom',
        },
      },
    })

    const mapped = mapTaskSSEEventToRunEvents(event)
    expect(mapped).toHaveLength(2)
    expect(mapped[0]?.eventType).toBe(RUN_EVENT_TYPE.STEP_START)
    expect(mapped[1]).toMatchObject({
      eventType: RUN_EVENT_TYPE.STEP_ERROR,
      runId: 'run_3',
      stepKey: 'step_c',
    })
  })

  it('maps task.completed to step.complete and run.complete', () => {
    const event = buildEvent({
      payload: {
        runId: 'run_4',
        stepId: 'step_d',
        lifecycleType: TASK_EVENT_TYPE.COMPLETED,
      },
    })

    const mapped = mapTaskSSEEventToRunEvents(event)
    expect(mapped).toHaveLength(2)
    expect(mapped[0]?.eventType).toBe(RUN_EVENT_TYPE.STEP_COMPLETE)
    expect(mapped[1]?.eventType).toBe(RUN_EVENT_TYPE.RUN_COMPLETE)
  })

  it('returns empty when runId is missing', () => {
    const event = buildEvent({
      payload: {
        stepId: 'step_x',
        lifecycleType: TASK_EVENT_TYPE.PROCESSING,
      },
    })
    expect(mapTaskSSEEventToRunEvents(event)).toEqual([])
  })
})
