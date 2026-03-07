import type { RunStepStatus, RunStreamLane, RunStreamStatus } from '@/lib/novel-promotion/run-stream/types'

export type RunStepState = {
  id: string
  attempt: number
  title: string
  stepIndex: number
  stepTotal: number
  status: RunStepStatus
  dependsOn: string[]
  blockedBy: string[]
  groupId: string | null
  parallelKey: string | null
  retryable: boolean
  textOutput: string
  reasoningOutput: string
  textLength: number
  reasoningLength: number
  message: string
  errorMessage: string
  updatedAt: number
  seqByLane: Record<RunStreamLane, number>
}

export type RunState = {
  runId: string
  status: RunStreamStatus
  startedAt: number
  updatedAt: number
  terminalAt: number | null
  errorMessage: string
  summary: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  stepsById: Record<string, RunStepState>
  stepOrder: string[]
  activeStepId: string | null
  selectedStepId: string | null
}

export type RunResult = {
  runId: string
  status: RunStreamStatus
  summary: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  errorMessage: string
}

export type StageViewStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'blocked' | 'stale'

export type RunStageView = {
  id: string
  title: string
  subtitle?: string
  status: StageViewStatus
  progress: number
  attempt?: number
  retryable?: boolean
}

export type UseRunStreamStateOptions<TParams extends Record<string, unknown>> = {
  projectId: string
  endpoint: (projectId: string) => string
  storageKeyPrefix: string
  storageScopeKey?: string
  buildRequestBody: (params: TParams) => Record<string, unknown>
  validateParams?: (params: TParams) => void
  resolveActiveRunId?: (context: { projectId: string; storageScopeKey?: string }) => Promise<string | null>
}

export type RunStreamView = {
  runState: RunState | null
  runId: string
  status: RunStreamStatus | 'idle'
  isRunning: boolean
  isRecoveredRunning: boolean
  isVisible: boolean
  errorMessage: string
  summary: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  stages: RunStageView[]
  orderedSteps: RunStepState[]
  activeStepId: string | null
  selectedStep: RunStepState | null
  outputText: string
  overallProgress: number
  activeMessage: string
  run: (params: Record<string, unknown>) => Promise<RunResult>
  retryStep: (params: { stepId: string; modelOverride?: string; reason?: string }) => Promise<RunResult>
  stop: () => void
  reset: () => void
  selectStep: (stepId: string) => void
}
