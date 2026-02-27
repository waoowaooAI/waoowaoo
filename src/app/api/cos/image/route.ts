import { NextRequest, NextResponse } from 'next/server'
import { getSignedUrl, toFetchableUrl } from '@/lib/cos'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 生成签名 URL（1小时有效期）
  const signedUrl = toFetchableUrl(getSignedUrl(key, 3600))

  // 重定向到签名 URL
  return NextResponse.redirect(signedUrl)
})
