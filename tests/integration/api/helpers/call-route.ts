import { NextRequest } from 'next/server'

type RouteParams = Record<string, string>
type HeaderMap = Record<string, string>

type RouteHandler = (
  req: NextRequest,
  ctx?: { params: Promise<RouteParams> },
) => Promise<Response>

export async function callRoute(
  handler: RouteHandler,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  options?: { headers?: HeaderMap; params?: RouteParams; query?: Record<string, string> },
) {
  const url = new URL('http://localhost:3000/api/test')
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value)
    }
  }

  const payload = body === undefined ? undefined : JSON.stringify(body)
  const req = new NextRequest(url, {
    method,
    headers: {
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...(options?.headers || {}),
    },
    ...(payload ? { body: payload } : {}),
  })
  const context = { params: Promise.resolve(options?.params || {}) }
  return await handler(req, context)
}
