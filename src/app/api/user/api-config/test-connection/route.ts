import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { testLlmConnection } from '@/lib/user-api/llm-test-connection'

export const POST = apiHandler(async (request: NextRequest) => {
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json().catch(() => ({}))
    const startedAt = Date.now()
    const result = await testLlmConnection(body)
    return NextResponse.json({
        success: true,
        latencyMs: Date.now() - startedAt,
        ...result,
    })
})
