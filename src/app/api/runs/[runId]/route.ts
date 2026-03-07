import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { getRunSnapshot } from '@/lib/run-runtime/service'

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { runId } = await context.params

  const snapshot = await getRunSnapshot(runId)
  if (!snapshot || snapshot.run.userId !== session.user.id) {
    throw new ApiError('NOT_FOUND')
  }

  return NextResponse.json(snapshot)
})

