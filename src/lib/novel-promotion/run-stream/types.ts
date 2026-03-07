export type RunStreamLane = 'text' | 'reasoning'

export type RunStreamEventType =
  | 'run.start'
  | 'run.complete'
  | 'run.error'
  | 'step.start'
  | 'step.chunk'
  | 'step.complete'
  | 'step.error'

export type RunStreamStatus = 'idle' | 'running' | 'completed' | 'failed'
export type RunStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'stale'

export type RunStreamEvent = {
  runId: string
  event: RunStreamEventType
  ts: string
  status?: RunStreamStatus | RunStepStatus
  stepId?: string
  stepAttempt?: number
  stepTitle?: string
  stepIndex?: number
  stepTotal?: number
  lane?: RunStreamLane
  seq?: number
  textDelta?: string
  reasoningDelta?: string
  text?: string
  reasoning?: string
  message?: string
  dependsOn?: string[]
  groupId?: string
  parallelKey?: string
  retryable?: boolean
  blockedBy?: string[]
  payload?: Record<string, unknown> | null
}
