'use client'

import {
  getImageGenerationCountConfig,
  getImageGenerationCountStorageKey,
  normalizeImageGenerationCount,
  type ImageGenerationCountScope,
} from './count'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getImageGenerationCount(scope: ImageGenerationCountScope): number {
  const storage = getStorage()
  const fallback = getImageGenerationCountConfig(scope).defaultValue
  if (!storage) return fallback
  const rawValue = storage.getItem(getImageGenerationCountStorageKey(scope))
  return normalizeImageGenerationCount(scope, rawValue, fallback)
}

export function setImageGenerationCount(scope: ImageGenerationCountScope, value: unknown): number {
  const normalized = normalizeImageGenerationCount(scope, value)
  const storage = getStorage()
  if (storage) {
    storage.setItem(getImageGenerationCountStorageKey(scope), String(normalized))
  }
  return normalized
}
