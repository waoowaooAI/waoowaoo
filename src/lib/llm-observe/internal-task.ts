import type { NextRequest } from 'next/server'

/**
 * Whether current request is executed by internal task worker.
 * Keep consistent with internal auth rules in `api-auth`.
 */
export function isInternalTaskExecution(request: NextRequest): boolean {
  const userId = request.headers.get('x-internal-user-id') || ''
  if (!userId) return false

  const expectedToken = process.env.INTERNAL_TASK_TOKEN || ''
  const token = request.headers.get('x-internal-task-token') || ''
  if (expectedToken) {
    return token === expectedToken
  }

  return process.env.NODE_ENV !== 'production'
}
