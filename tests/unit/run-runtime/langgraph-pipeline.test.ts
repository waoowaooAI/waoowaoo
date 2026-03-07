import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphExecutorState } from '@/lib/run-runtime/graph-executor'

const executePipelineGraphMock = vi.hoisted(() =>
  vi.fn(async (input: {
    runId: string
    projectId: string
    userId: string
    state: GraphExecutorState
    nodes: Array<{
      key: string
      run: (context: {
        runId: string
        projectId: string
        userId: string
        nodeKey: string
        attempt: number
        state: GraphExecutorState
      }) => Promise<unknown>
    }>
  }) => {
    for (const node of input.nodes) {
      await node.run({
        runId: input.runId,
        projectId: input.projectId,
        userId: input.userId,
        nodeKey: node.key,
        attempt: 1,
        state: input.state,
      })
    }
    return input.state
  }),
)

vi.mock('@/lib/run-runtime/graph-executor', () => ({
  executePipelineGraph: executePipelineGraphMock,
}))

import { runLangGraphPipeline } from '@/lib/run-runtime/langgraph-pipeline'

type TestState = GraphExecutorState & {
  order: string[]
}

describe('langgraph pipeline adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs nodes in declared order through langgraph', async () => {
    const state: TestState = {
      refs: {},
      meta: {},
      order: [],
    }

    const result = await runLangGraphPipeline({
      runId: 'run-1',
      projectId: 'project-1',
      userId: 'user-1',
      state,
      nodes: [
        {
          key: 'node_a',
          title: 'Node A',
          run: async (context) => {
            const typedState = context.state as TestState
            typedState.order.push('node_a')
            return { output: { ok: true } }
          },
        },
        {
          key: 'node_b',
          title: 'Node B',
          run: async (context) => {
            const typedState = context.state as TestState
            typedState.order.push('node_b')
            return { output: { ok: true } }
          },
        },
      ],
    })

    expect(result.order).toEqual(['node_a', 'node_b'])
    expect(executePipelineGraphMock).toHaveBeenCalledTimes(2)
  })

  it('returns input state when graph has no nodes', async () => {
    const state: TestState = {
      refs: {},
      meta: {},
      order: [],
    }

    const result = await runLangGraphPipeline({
      runId: 'run-1',
      projectId: 'project-1',
      userId: 'user-1',
      state,
      nodes: [],
    })

    expect(result).toBe(state)
    expect(executePipelineGraphMock).not.toHaveBeenCalled()
  })

  it('fails explicitly on duplicate node keys', async () => {
    const state: TestState = {
      refs: {},
      meta: {},
      order: [],
    }

    await expect(
      runLangGraphPipeline({
        runId: 'run-1',
        projectId: 'project-1',
        userId: 'user-1',
        state,
        nodes: [
          {
            key: 'dup',
            title: 'Dup 1',
            run: async () => ({ output: { ok: true } }),
          },
          {
            key: 'dup',
            title: 'Dup 2',
            run: async () => ({ output: { ok: true } }),
          },
        ],
      }),
    ).rejects.toThrow('LANGGRAPH_NODE_KEY_DUPLICATE: dup')
  })
})
