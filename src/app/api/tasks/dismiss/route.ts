import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { dismissFailedTasks } from '@/lib/task/service'

export const POST = apiHandler(async (request: NextRequest) => {
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const { taskIds } = body as { taskIds?: string[] }

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
        throw new ApiError('INVALID_PARAMS')
    }

    if (taskIds.length > 200) {
        throw new ApiError('INVALID_PARAMS')
    }

    const count = await dismissFailedTasks(taskIds, session.user.id)

    return NextResponse.json({ success: true, dismissed: count })
})
