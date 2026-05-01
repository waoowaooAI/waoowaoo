import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  CanvasLayoutEpisodeMismatchError,
  getProjectCanvasLayout,
  upsertProjectCanvasLayout,
} from '@/lib/project-canvas/layout/canvas-layout-service'
import { upsertCanvasLayoutInputSchema } from '@/lib/project-canvas/layout/canvas-layout-contract'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = request.nextUrl.searchParams.get('episodeId')?.trim() || ''
  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', {
      field: 'episodeId',
      message: 'episodeId is required',
    })
  }

  const layout = await getProjectCanvasLayout({ projectId, episodeId })
  return NextResponse.json({
    success: true,
    layout,
  })
})

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  const parsed = upsertCanvasLayoutInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      field: 'body',
      message: 'invalid canvas layout payload',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  let layout
  try {
    layout = await upsertProjectCanvasLayout({
      projectId,
      input: parsed.data,
    })
  } catch (error) {
    if (error instanceof CanvasLayoutEpisodeMismatchError) {
      throw new ApiError('INVALID_PARAMS', {
        field: 'episodeId',
        message: 'episodeId does not belong to project',
      })
    }
    throw error
  }

  return NextResponse.json({
    success: true,
    layout,
  })
})
