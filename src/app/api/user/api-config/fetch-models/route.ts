import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { fetchProviderModels } from '@/lib/user-api/provider-models'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const models = await fetchProviderModels(body)

  return NextResponse.json({
    success: true,
    count: models.length,
    models,
  })
})
