import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import {
  executePipelineGraph,
  type GraphExecutorInput,
  type GraphExecutorState,
} from './graph-executor'

function assertUniqueNodeKeys<TState extends GraphExecutorState>(input: GraphExecutorInput<TState>) {
  const seen = new Set<string>()
  for (const node of input.nodes) {
    if (seen.has(node.key)) {
      throw new Error(`LANGGRAPH_NODE_KEY_DUPLICATE: ${node.key}`)
    }
    seen.add(node.key)
  }
}

function createStateAnnotation<TState extends GraphExecutorState>(initialState: TState) {
  return Annotation.Root({
    pipelineState: Annotation<unknown>({
      reducer: (_current, update) => update,
      default: () => initialState,
    }),
  })
}

function readPipelineState<TState extends GraphExecutorState>(value: unknown): TState {
  if (!value || typeof value !== 'object') {
    throw new Error('LANGGRAPH_STATE_INVALID: state object missing')
  }
  const pipelineState = (value as { pipelineState?: unknown }).pipelineState
  if (!pipelineState || typeof pipelineState !== 'object') {
    throw new Error('LANGGRAPH_STATE_INVALID: pipelineState missing')
  }
  return pipelineState as TState
}

function addEdgeUnsafe(
  graphBuilder: unknown,
  source: string,
  target: string,
) {
  const writable = graphBuilder as unknown as {
    addEdge: (nextSource: string, nextTarget: string) => unknown
  }
  writable.addEdge(source, target)
}

export async function runLangGraphPipeline<TState extends GraphExecutorState>(
  input: GraphExecutorInput<TState>,
): Promise<TState> {
  if (input.nodes.length === 0) {
    return input.state
  }

  assertUniqueNodeKeys(input)

  const stateAnnotation = createStateAnnotation(input.state)
  const graphBuilder = new StateGraph(stateAnnotation)

  for (const node of input.nodes) {
    graphBuilder.addNode(node.key, async (state: { pipelineState: unknown }) => {
      const pipelineState = readPipelineState<TState>({ pipelineState: state.pipelineState })
      await executePipelineGraph({
        runId: input.runId,
        projectId: input.projectId,
        userId: input.userId,
        state: pipelineState,
        nodes: [node],
      })
      return {
        pipelineState,
      }
    })
  }

  addEdgeUnsafe(graphBuilder, START, input.nodes[0].key)
  for (let index = 0; index < input.nodes.length; index += 1) {
    const currentKey = input.nodes[index].key
    const nextKey = input.nodes[index + 1]?.key
    addEdgeUnsafe(graphBuilder, currentKey, nextKey || END)
  }

  const compiled = graphBuilder.compile()
  const result = await compiled.invoke({
    pipelineState: input.state,
  })
  return readPipelineState<TState>(result)
}
