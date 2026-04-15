'use client'

import { extractErrorMessage } from '@/lib/errors/extract'

export function getErrorMessage(error: unknown): string {
  return extractErrorMessage(error, 'Unknown error')
}
