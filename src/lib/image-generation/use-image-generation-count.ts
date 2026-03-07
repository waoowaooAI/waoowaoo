'use client'

import { useCallback, useState } from 'react'
import {
  getImageGenerationCount,
  setImageGenerationCount,
} from './count-preference'
import type { ImageGenerationCountScope } from './count'

export function useImageGenerationCount(scope: ImageGenerationCountScope) {
  const [count, setCountState] = useState<number>(() => getImageGenerationCount(scope))

  const updateCount = useCallback((value: number) => {
    const normalized = setImageGenerationCount(scope, value)
    setCountState(normalized)
    return normalized
  }, [scope])

  return {
    count,
    setCount: updateCount,
  }
}
