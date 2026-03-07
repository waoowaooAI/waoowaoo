import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { testProviderConnection } from '@/lib/user-api/provider-test'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const startedAt = Date.now()
  const result = await testProviderConnection(body)
  return NextResponse.json({
    ...result,
    latencyMs: Date.now() - startedAt,
  })
})
