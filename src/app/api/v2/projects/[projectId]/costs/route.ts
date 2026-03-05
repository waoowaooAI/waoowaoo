import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { getProjectCostDetails } from '@/lib/billing'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  })
  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  const costDetails = await getProjectCostDetails(projectId)
  return NextResponse.json({
    ok: true,
    projectId,
    projectName: project.name,
    currency: BILLING_CURRENCY,
    ...costDetails,
  })
})
