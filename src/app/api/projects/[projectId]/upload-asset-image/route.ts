import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/projects/[projectId]/upload-asset-image
 * 上传用户自定义图片作为角色或场景资产
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 解析表单数据
  const formData = await request.formData()
  const file = formData.get('file') as File
  const type = formData.get('type') as string // 'character' | 'location'
  const id = formData.get('id') as string // characterId 或 locationId
  const appearanceId = formData.get('appearanceId') as string | null  // UUID
  const imageIndex = formData.get('imageIndex') as string | null

  if (!file || !type || !id) {
    throw new ApiError('INVALID_PARAMS')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const filename = typeof file.name === 'string' ? file.name : undefined

  const parsedIndex = imageIndex !== null && imageIndex !== undefined && String(imageIndex).trim()
    ? Number.parseInt(String(imageIndex), 10)
    : null
  const normalizedIndex = parsedIndex !== null && Number.isFinite(parsedIndex) ? parsedIndex : null

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'upload_asset_image',
    projectId,
    userId: authResult.session.user.id,
    input: {
      type,
      id,
      appearanceId,
      imageIndex: normalizedIndex,
      imageBase64: buffer.toString('base64'),
      ...(filename ? { filename } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
