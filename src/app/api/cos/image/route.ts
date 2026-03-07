import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  const expires = searchParams.get('expires') || '3600'

  if (!key) {
    throw new ApiError('INVALID_PARAMS')
  }

  const location = `/api/storage/sign?key=${encodeURIComponent(key)}&expires=${encodeURIComponent(expires)}`
  return NextResponse.redirect(location)
})
