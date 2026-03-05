import { NextResponse } from 'next/server'

function gone() {
  return NextResponse.json(
    {
      error: {
        code: 'ENDPOINT_REMOVED',
        message: 'legacy endpoint removed, use /api/v2 routes',
      },
    },
    { status: 410 },
  )
}

export const GET = gone
export const POST = gone
export const PUT = gone
export const PATCH = gone
export const DELETE = gone
export const OPTIONS = gone
