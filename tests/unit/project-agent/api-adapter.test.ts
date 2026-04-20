import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'

const registryState = vi.hoisted(() => ({
  registry: {} as ProjectAgentOperationRegistry,
}))

vi.mock('@/lib/operations/registry', () => ({
  createProjectAgentOperationRegistry: () => registryState.registry,
}))

import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

function buildRequest(): NextRequest {
  return new Request('http://localhost') as unknown as NextRequest
}

describe('executeProjectAgentOperationFromApi', () => {
  beforeEach(() => {
    registryState.registry = {}
    vi.clearAllMocks()
  })

  it('[operation not found] -> throws ApiError NOT_FOUND with operation id', async () => {
    const promise = executeProjectAgentOperationFromApi({
      request: buildRequest(),
      operationId: 'missing_op',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
      source: 'project-ui',
    })

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'NOT_FOUND',
      details: expect.objectContaining({
        message: 'operation not found: missing_op',
      }),
    })
  })

  it('[input schema mismatch] -> throws ApiError INVALID_PARAMS with zod issues', async () => {
    registryState.registry = {
      input_guard_op: {
        id: 'input_guard_op',
        description: 'input guard',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        inputSchema: z.object({ projectId: z.string().min(1) }),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => ({ ok: true })),
      },
    }

    const promise = executeProjectAgentOperationFromApi({
      request: buildRequest(),
      operationId: 'input_guard_op',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
      source: 'project-ui',
    })

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      details: expect.objectContaining({
        message: 'INVALID_PARAMS',
        issues: expect.any(Array),
      }),
    })
  })

  it('[output schema mismatch] -> throws ApiError EXTERNAL_ERROR with output-invalid code', async () => {
    registryState.registry = {
      output_guard_op: {
        id: 'output_guard_op',
        description: 'output guard',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => ({ value: 'unexpected-shape' })),
      },
    }

    const promise = executeProjectAgentOperationFromApi({
      request: buildRequest(),
      operationId: 'output_guard_op',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
      source: 'project-ui',
    })

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'EXTERNAL_ERROR',
      details: expect.objectContaining({
        code: 'OPERATION_OUTPUT_INVALID',
        message: 'operation output schema mismatch: output_guard_op',
      }),
    })
  })

  it('[execution throws not found-like message] -> infers ApiError NOT_FOUND', async () => {
    registryState.registry = {
      infer_not_found_op: {
        id: 'infer_not_found_op',
        description: 'infer not found',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => {
          throw new Error('resource not found')
        }),
      },
    }

    const promise = executeProjectAgentOperationFromApi({
      request: buildRequest(),
      operationId: 'infer_not_found_op',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
      source: 'project-ui',
    })

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'NOT_FOUND',
      details: expect.objectContaining({
        message: 'resource not found',
      }),
    })
  })

  it('[requiresConfirmation sideEffects] -> api adapter does not enforce confirmed gate', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    registryState.registry = {
      confirm_semantics_op: {
        id: 'confirm_semantics_op',
        description: 'confirm semantics',
        scope: 'project',
        sideEffects: {
          mode: 'act',
          risk: 'high',
          requiresConfirmation: true,
          confirmationSummary: 'requires explicit confirmation',
        },
        inputSchema: z.object({ confirmed: z.boolean().optional() }),
        outputSchema: z.object({ ok: z.boolean() }),
        execute,
      },
    }

    const result = await executeProjectAgentOperationFromApi({
      request: buildRequest(),
      operationId: 'confirm_semantics_op',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
      source: 'project-ui',
    })

    expect(result).toEqual({ ok: true })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(expect.any(Object), {})
  })

  it('[execution throws undefined] -> throws ApiError EXTERNAL_ERROR with fallback message', async () => {
    registryState.registry = {
      fail_undefined: {
        id: 'fail_undefined',
        description: 'fail undefined',
        scope: 'project',
        sideEffects: { mode: 'act', risk: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => {
          throw undefined
        }),
      },
    }

    const promise = executeProjectAgentOperationFromApi({
      request: buildRequest(),
      operationId: 'fail_undefined',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
      source: 'project-ui',
    })

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'EXTERNAL_ERROR',
      details: expect.objectContaining({
        code: 'OPERATION_EXECUTION_FAILED',
        message: 'OPERATION_FAILED',
      }),
    })
  })
})

