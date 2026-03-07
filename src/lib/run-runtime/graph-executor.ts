import { normalizeAnyError } from '@/lib/errors/normalize'
import { buildLeanState, createCheckpoint, getRunById } from './service'
import type { StateRef } from './types'

type JsonRecord = Record<string, unknown>

export type GraphExecutorState = {
  refs: StateRef
  meta: JsonRecord
}

export type GraphNodeContext<TState extends GraphExecutorState> = {
  runId: string
  projectId: string
  userId: string
  nodeKey: string
  attempt: number
  state: TState
}

export type GraphNodeResult = {
  output?: JsonRecord
  checkpointRefs?: StateRef
  checkpointMeta?: JsonRecord
}

export type GraphNode<TState extends GraphExecutorState> = {
  key: string
  title: string
  maxAttempts?: number
  timeoutMs?: number
  run: (context: GraphNodeContext<TState>) => Promise<GraphNodeResult | void>
}

export type GraphExecutorInput<TState extends GraphExecutorState> = {
  runId: string
  projectId: string
  userId: string
  state: TState
  nodes: GraphNode<TState>[]
}

export class GraphCancellationError extends Error {
  constructor(message = 'run canceled') {
    super(message)
    this.name = 'GraphCancellationError'
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return task
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`node timeout after ${Math.floor(timeoutMs)}ms`))
    }, timeoutMs)

    task
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error: unknown) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function computeBackoffMs(attempt: number): number {
  const base = Math.min(1_000 * Math.pow(2, Math.max(0, attempt - 1)), 10_000)
  const jitter = Math.floor(Math.random() * 200)
  return base + jitter
}

async function assertRunActive(runId: string, userId: string) {
  const run = await getRunById(runId)
  if (!run || run.userId !== userId) {
    throw new GraphCancellationError('run not found')
  }
  if (run.status === 'canceling' || run.status === 'canceled') {
    throw new GraphCancellationError('run canceled')
  }
}

function mergeRefs(base: StateRef, next: StateRef | undefined): StateRef {
  if (!next) return base
  return {
    scriptId: next.scriptId || base.scriptId,
    storyboardId: next.storyboardId || base.storyboardId,
    voiceLineBatchId: next.voiceLineBatchId || base.voiceLineBatchId,
    versionHash: next.versionHash || base.versionHash,
    cursor: next.cursor || base.cursor,
  }
}

export async function executePipelineGraph<TState extends GraphExecutorState>(
  input: GraphExecutorInput<TState>,
): Promise<TState> {
  const { nodes, runId, projectId, userId, state } = input

  for (const node of nodes) {
    const maxAttempts = Number.isFinite(node.maxAttempts || 1)
      ? Math.max(1, Math.floor(node.maxAttempts || 1))
      : 1

    let attempt = 1
    while (attempt <= maxAttempts) {
      await assertRunActive(runId, userId)

      try {
        const result = await withTimeout(
          node.run({
            runId,
            projectId,
            userId,
            nodeKey: node.key,
            attempt,
            state,
          }),
          node.timeoutMs || 0,
        )

        state.refs = mergeRefs(state.refs, result?.checkpointRefs)
        if (result?.checkpointMeta) {
          state.meta = {
            ...state.meta,
            ...result.checkpointMeta,
          }
        }

        await createCheckpoint({
          runId,
          nodeKey: node.key,
          version: attempt,
          state: buildLeanState({
            refs: state.refs,
            meta: {
              ...state.meta,
              nodeTitle: node.title,
              nodeAttempt: attempt,
              ...(result?.output ? { output: result.output } : {}),
            },
          }),
        })

        break
      } catch (error) {
        if (error instanceof GraphCancellationError) {
          throw error
        }

        const normalized = normalizeAnyError(error, { context: 'worker' })
        const shouldRetry = normalized.retryable && attempt < maxAttempts
        if (!shouldRetry) {
          throw error
        }

        await wait(computeBackoffMs(attempt))
        attempt += 1
      }
    }
  }

  return state
}
