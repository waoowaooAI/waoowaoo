import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { detectEpisodeMarkers, splitByMarkers } from '@/lib/episode-marker-detector'

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length <= 0) {
    throw new ApiError('INVALID_PARAMS', { message: `${name} 不能为空` })
  }
  return value
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const raw = await request.json().catch(() => null)
  const body = asObject(raw)
  if (!body) {
    throw new ApiError('INVALID_PARAMS', { message: 'request body 必须是对象' })
  }
  const content = asRequiredString(body.content, 'content')
  const markerResult = detectEpisodeMarkers(content)
  if (!markerResult.hasMarkers) {
    throw new ApiError('INVALID_PARAMS', { message: '未检测到可用章节标记' })
  }

  const episodes = splitByMarkers(content, markerResult)
  return NextResponse.json({
    ok: true,
    markerType: markerResult.markerType,
    confidence: markerResult.confidence,
    episodes,
  })
})
