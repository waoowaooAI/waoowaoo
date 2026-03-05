'use client'

import { useEffect, useRef } from 'react'

/**
 * Persist a state value to localStorage with debounce.
 * Restores from localStorage on mount via the restore callback.
 */
export function useLocalPersist<T>(
  key: string,
  state: T,
  restore: (saved: T) => void,
  debounceMs = 1000,
) {
  const restoredRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore once on mount
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as T
        restore(parsed)
      }
    } catch {
      // Corrupted data — ignore
    }
  }, [key, restore])

  // Persist on state change (debounced)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        // localStorage full or unavailable — ignore
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [key, state, debounceMs])
}
