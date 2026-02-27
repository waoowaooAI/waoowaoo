import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'

export type MutationRequestError = Error & {
  status?: number
  payload?: Record<string, unknown>
  detail?: string
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}))
  if (data && typeof data === 'object') return data as Record<string, unknown>
  return {}
}

function createRequestError(
  status: number,
  payload: Record<string, unknown>,
  fallbackMessage: string,
): MutationRequestError {
  const error = new Error(resolveTaskErrorMessage(payload, fallbackMessage)) as MutationRequestError
  error.status = status
  error.payload = payload
  if (typeof payload.detail === 'string') {
    error.detail = payload.detail
  }
  return error
}

export async function requestJsonWithError<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(input, init)
  const data = await parseJsonSafe(response)
  if (!response.ok) {
    throw createRequestError(response.status, data, fallbackMessage)
  }
  return data as T
}

export async function requestVoidWithError(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<void> {
  const response = await fetch(input, init)
  if (response.ok) return
  const data = await parseJsonSafe(response)
  throw createRequestError(response.status, data, fallbackMessage)
}

export async function requestTaskResponseWithError(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<Response> {
  const response = await fetch(input, init)
  if (response.ok) return response
  const data = await parseJsonSafe(response)
  throw createRequestError(response.status, data, fallbackMessage)
}

export async function requestBlobWithError(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<Blob> {
  const response = await fetch(input, init)
  if (response.ok) {
    return await response.blob()
  }

  const data = await parseJsonSafe(response)
  throw createRequestError(response.status, data, fallbackMessage)
}

export async function invalidateQueryTemplates(
  queryClient: QueryClient,
  templates: QueryKey[],
): Promise<void> {
  await Promise.all(
    templates.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
