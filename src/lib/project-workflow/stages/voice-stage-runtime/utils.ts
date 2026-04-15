'use client'

import { extractErrorMessage, extractErrorStatus } from '@/lib/errors/extract'

export function getErrorMessage(error: unknown): string {
  return extractErrorMessage(error, 'Unknown error')
}

export function getErrorStatus(error: unknown): number | null {
  return extractErrorStatus(error)
}
