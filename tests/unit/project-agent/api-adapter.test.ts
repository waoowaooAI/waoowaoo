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

