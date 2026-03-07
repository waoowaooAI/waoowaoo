'use client'

import { extractErrorMessage } from '@/lib/errors/extract'

export function getErrorMessage(error: unknown, fallback: string): string {
  return extractErrorMessage(error, fallback)
}

export function parseImagePrompt(imagePrompt: string | null) {
  if (!imagePrompt) return { content: '' }
  return { content: imagePrompt }
}
