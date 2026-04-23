import { describe, expect, it } from 'vitest'
import {
  storyboardMutationOperationOutputSchema,
  taskBatchSubmitOperationOutputSchema,
  taskSubmitOperationOutputSchema,
} from '@/lib/operations/output-schemas'

describe('operation output schemas', () => {
  it('enforces minimal stable shape for single task submission outputs', () => {
    const ok = taskSubmitOperationOutputSchema.safeParse({
      success: true,
      async: true,
      taskId: 'task_1',
      status: 'queued',
      runId: null,
      deduped: false,
    })
    if (!ok.success) {
      throw new Error(`expected taskSubmitOperationOutputSchema to accept minimal output, got: ${ok.error.message}`)
    }

    const bad = taskSubmitOperationOutputSchema.safeParse({
      success: true,
      async: false,
      taskId: 'task_1',
      status: 'queued',
      runId: null,
      deduped: false,
    })
    if (bad.success) {
      throw new Error('expected taskSubmitOperationOutputSchema to reject async=false; this would hide a submit-op semantic bug')
    }
    expect(bad.error.issues.map((issue) => issue.message).join('\n')).toContain('TASK_SUBMIT_OUTPUT_EXPECTS_SUCCESS_TRUE_ASYNC_TRUE')
  })

  it('enforces minimal stable shape for batch task submission outputs', () => {
    const ok = taskBatchSubmitOperationOutputSchema.safeParse({
      success: true,
      async: true,
      total: 0,
      taskIds: [],
      results: [],
    })
    if (!ok.success) {
      throw new Error(`expected taskBatchSubmitOperationOutputSchema to accept minimal output, got: ${ok.error.message}`)
    }

    const bad = taskBatchSubmitOperationOutputSchema.safeParse({
      success: false,
      async: true,
      total: 0,
      taskIds: [],
      results: [],
    })
    if (bad.success) {
      throw new Error('expected taskBatchSubmitOperationOutputSchema to reject success=false; this would hide a batch-submit semantic bug')
    }
    expect(bad.error.issues.map((issue) => issue.message).join('\n')).toContain('TASK_BATCH_SUBMIT_OUTPUT_EXPECTS_SUCCESS_TRUE_ASYNC_TRUE')
  })

  it('requires mutationBatchId unless noop=true for storyboard mutations', () => {
    const missingBatch = storyboardMutationOperationOutputSchema.safeParse({
      success: true,
      noop: false,
    })
    if (missingBatch.success) {
      throw new Error('expected storyboardMutationOperationOutputSchema to require mutationBatchId when noop is not true')
    }
    expect(missingBatch.error.issues.map((issue) => issue.message).join('\n')).toContain('STORYBOARD_MUTATION_OUTPUT_MISSING_MUTATION_BATCH_ID')

    const noopOk = storyboardMutationOperationOutputSchema.safeParse({
      success: true,
      noop: true,
    })
    if (!noopOk.success) {
      throw new Error(`expected storyboardMutationOperationOutputSchema to allow noop=true without mutationBatchId, got: ${noopOk.error.message}`)
    }
  })
})

