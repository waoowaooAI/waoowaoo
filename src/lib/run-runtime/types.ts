export const RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELING: 'canceling',
  CANCELED: 'canceled',
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

export const RUN_STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const

export type RunStepStatus = (typeof RUN_STEP_STATUS)[keyof typeof RUN_STEP_STATUS]

export const RUN_EVENT_TYPE = {
  RUN_START: 'run.start',
  STEP_START: 'step.start',
  STEP_CHUNK: 'step.chunk',
  STEP_COMPLETE: 'step.complete',
  STEP_ERROR: 'step.error',
  RUN_COMPLETE: 'run.complete',
  RUN_ERROR: 'run.error',
  RUN_CANCELED: 'run.canceled',
} as const

export type RunEventType = (typeof RUN_EVENT_TYPE)[keyof typeof RUN_EVENT_TYPE]

export type RunEventInput = {
  runId: string
  projectId: string
  userId: string
  eventType: RunEventType
  stepKey?: string | null
  attempt?: number | null
  lane?: 'text' | 'reasoning' | null
  payload?: Record<string, unknown> | null
}

export type RunEvent = {
  id: string
  runId: string
  projectId: string
  userId: string
  seq: number
  eventType: RunEventType
  stepKey?: string | null
  attempt?: number | null
  lane?: 'text' | 'reasoning' | null
  payload?: Record<string, unknown> | null
  createdAt: string
}

export type CreateRunInput = {
  userId: string
  projectId: string
  episodeId?: string | null
  workflowType: string
  taskType?: string | null
  taskId?: string | null
  targetType: string
  targetId: string
  input?: Record<string, unknown> | null
}

export type ListRunsInput = {
  userId: string
  projectId?: string
  workflowType?: string
  targetType?: string
  targetId?: string
  episodeId?: string
  statuses?: RunStatus[]
  limit?: number
}

export type StateRef = {
  scriptId?: string
  storyboardId?: string
  voiceLineBatchId?: string
  versionHash?: string
  cursor?: string
}

export const RUN_STATE_MAX_BYTES = 64 * 1024
