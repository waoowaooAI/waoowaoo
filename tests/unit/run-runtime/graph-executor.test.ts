import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executePipelineGraph,
  GraphCancellationError,
  type GraphExecutorState,
} from '@/lib/run-runtime/graph-executor'

const { createCheckpointMock, getRunByIdMock } = vi.hoisted(() => ({
  createCheckpointMock: vi.fn(),
  getRunByIdMock: vi.fn(),
}))

vi.mock('@/lib/run-runtime/service', () => ({
  buildLeanState: vi.fn((value: unknown) => value),
  createCheckpoint: createCheckpointMock,
  getRunById: getRunByIdMock,
}))

describe('graph executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRunByIdMock.mockResolvedValue({
      id: 'run_1',
      userId: 'user_1',
      status: 'running',
    })
  })

  it('retries retryable node error and writes checkpoint once success', async () => {
    const state: GraphExecutorState = {
      refs: {},
      meta: {},
    }

    const runMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed sending request'))
      .mockResolvedValueOnce({
        output: { ok: true },
      })

    await executePipelineGraph({
      runId: 'run_1',
      projectId: 'project_1',
      userId: 'user_1',
      state,
      nodes: [
        {
          key: 'node_a',
          title: 'Node A',
          maxAttempts: 2,
          run: runMock,
        },
      ],
    })

    expect(runMock).toHaveBeenCalledTimes(2)
    expect(createCheckpointMock).toHaveBeenCalledTimes(1)
    expect(createCheckpointMock).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      nodeKey: 'node_a',
      version: 2,
    }))
  })

  it('throws cancellation error when run status is canceling', async () => {
    getRunByIdMock.mockResolvedValue({
      id: 'run_1',
      userId: 'user_1',
      status: 'canceling',
    })

    await expect(
      executePipelineGraph({
        runId: 'run_1',
        projectId: 'project_1',
        userId: 'user_1',
        state: {
          refs: {},
          meta: {},
        },
        nodes: [
          {
            key: 'node_a',
            title: 'Node A',
            run: async () => ({ output: { ok: true } }),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(GraphCancellationError)
  })

  it('merges refs into state and persists lean checkpoint', async () => {
    const state: GraphExecutorState = {
      refs: {
        scriptId: 'script_1',
      },
      meta: {
        tag: 'v1',
      },
    }

    await executePipelineGraph({
      runId: 'run_1',
      projectId: 'project_1',
      userId: 'user_1',
      state,
      nodes: [
        {
          key: 'node_b',
          title: 'Node B',
          run: async () => ({
            checkpointRefs: {
              storyboardId: 'storyboard_1',
            },
            checkpointMeta: {
              done: true,
            },
          }),
        },
      ],
    })

    expect(state.refs).toEqual({
      scriptId: 'script_1',
      storyboardId: 'storyboard_1',
      voiceLineBatchId: undefined,
      versionHash: undefined,
      cursor: undefined,
    })
    expect(createCheckpointMock).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        refs: expect.objectContaining({
          scriptId: 'script_1',
          storyboardId: 'storyboard_1',
        }),
      }),
    }))
  })
})
