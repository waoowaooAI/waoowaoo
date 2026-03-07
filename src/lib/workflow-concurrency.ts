export const DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY = 5
export const DEFAULT_IMAGE_WORKFLOW_CONCURRENCY = 5
export const DEFAULT_VIDEO_WORKFLOW_CONCURRENCY = 5

export interface WorkflowConcurrencyConfig {
  analysis: number
  image: number
  video: number
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  const normalized = Math.floor(value)
  if (normalized <= 0) return null
  return normalized
}

export function normalizeWorkflowConcurrencyValue(value: unknown, fallback: number): number {
  const normalized = toPositiveInt(value)
  if (normalized === null) return fallback
  return normalized
}

export function normalizeWorkflowConcurrencyConfig(
  value: Partial<Record<keyof WorkflowConcurrencyConfig, unknown>> | null | undefined,
): WorkflowConcurrencyConfig {
  return {
    analysis: normalizeWorkflowConcurrencyValue(
      value?.analysis,
      DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
    ),
    image: normalizeWorkflowConcurrencyValue(
      value?.image,
      DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
    ),
    video: normalizeWorkflowConcurrencyValue(
      value?.video,
      DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
    ),
  }
}
