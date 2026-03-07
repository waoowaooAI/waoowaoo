import { runPipelineGraph, type PipelineGraphNode, type PipelineGraphState } from './pipeline-graph'

type QuickRunInput<TState extends PipelineGraphState> = {
  runId: string
  projectId: string
  userId: string
  nodeKey: string
  nodeTitle: string
  state: TState
  run: PipelineGraphNode<TState>['run']
  maxAttempts?: number
  timeoutMs?: number
}

export async function runQuickRunGraph<TState extends PipelineGraphState>(input: QuickRunInput<TState>) {
  return await runPipelineGraph({
    runId: input.runId,
    projectId: input.projectId,
    userId: input.userId,
    state: input.state,
    nodes: [
      {
        key: input.nodeKey,
        title: input.nodeTitle,
        maxAttempts: input.maxAttempts,
        timeoutMs: input.timeoutMs,
        run: input.run,
      },
    ],
  })
}
