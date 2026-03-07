import { NextRequest } from 'next/server'

type HeaderMap = Record<string, string>
type QueryMap = Record<string, string | number | boolean>

function toJsonBody(body: unknown): string | undefined {
  if (body === undefined) return undefined
  return JSON.stringify(body)
}

function appendQuery(url: URL, query?: QueryMap) {
  if (!query) return
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value))
  }
}

export function buildMockRequest(params: {
  path: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: HeaderMap
  query?: QueryMap
}) {
  const url = new URL(params.path, 'http://localhost:3000')
  appendQuery(url, params.query)
  const jsonBody = toJsonBody(params.body)

  const headers: HeaderMap = {
    ...(params.headers || {}),
  }
  if (jsonBody !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json'
  }

  return new NextRequest(url, {
    method: params.method,
    headers,
    ...(jsonBody !== undefined ? { body: jsonBody } : {}),
  })
}

export async function callRoute<TContext>(
  handler: (req: NextRequest, ctx: TContext) => Promise<Response>,
  params: {
    path: string
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    body?: unknown
    headers?: HeaderMap
    query?: QueryMap
    context: TContext
  },
) {
  const req = buildMockRequest({
    path: params.path,
    method: params.method,
    body: params.body,
    headers: params.headers,
    query: params.query,
  })
  return await handler(req, params.context)
}
