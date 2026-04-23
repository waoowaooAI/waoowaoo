import { z } from 'zod'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export const taskSubmitOperationOutputSchemaBase = z.object({
  success: z.boolean(),
  async: z.boolean(),
  taskId: z.string().min(1),
  status: z.string().min(1),
  runId: z.string().nullable(),
  deduped: z.boolean(),
}).passthrough()

export function refineTaskSubmitOperationOutputSchema<
  TSchema extends z.ZodTypeAny,
>(schema: TSchema) {
  return schema.refine((value) => {
    const record = asRecord(value)
    return record?.success === true && record?.async === true
  }, {
    message: 'TASK_SUBMIT_OUTPUT_EXPECTS_SUCCESS_TRUE_ASYNC_TRUE (submit op must return success=true & async=true)',
    path: ['success'],
  })
}

export const taskSubmitOperationOutputSchema = refineTaskSubmitOperationOutputSchema(taskSubmitOperationOutputSchemaBase)

export const taskBatchSubmitOperationOutputSchemaBase = z.object({
  success: z.boolean(),
  async: z.boolean(),
  total: z.number().int().min(0),
  taskIds: z.array(z.string().min(1)),
  results: z.array(z.object({
    refId: z.string().min(1),
    taskId: z.string().min(1),
  })).optional(),
  mutationBatchId: z.string().min(1).optional(),
}).passthrough()

export function refineTaskBatchSubmitOperationOutputSchema<
  TSchema extends z.ZodTypeAny,
>(schema: TSchema) {
  return schema.refine((value) => {
    const record = asRecord(value)
    return record?.success === true && record?.async === true
  }, {
    message: 'TASK_BATCH_SUBMIT_OUTPUT_EXPECTS_SUCCESS_TRUE_ASYNC_TRUE (batch submit op must return success=true & async=true)',
    path: ['success'],
  })
}

export const taskBatchSubmitOperationOutputSchema = refineTaskBatchSubmitOperationOutputSchema(taskBatchSubmitOperationOutputSchemaBase)

export const storyboardMutationOperationOutputSchemaBase = z.object({
  success: z.boolean(),
  mutationBatchId: z.string().min(1).optional(),
  noop: z.boolean().optional(),
}).passthrough()

export function refineStoryboardMutationOperationOutputSchema<
  TSchema extends z.ZodTypeAny,
>(schema: TSchema) {
  return schema.refine((value) => {
    const record = asRecord(value)
    return record?.success === true
  }, {
    message: 'STORYBOARD_MUTATION_OUTPUT_EXPECTS_SUCCESS_TRUE',
    path: ['success'],
  }).refine((value) => {
    const record = asRecord(value)
    if (!record) return false
    return record.noop === true || typeof record.mutationBatchId === 'string'
  }, {
    message: 'STORYBOARD_MUTATION_OUTPUT_MISSING_MUTATION_BATCH_ID (expected mutationBatchId unless noop=true)',
    path: ['mutationBatchId'],
  })
}

export const storyboardMutationOperationOutputSchema = refineStoryboardMutationOperationOutputSchema(storyboardMutationOperationOutputSchemaBase)
