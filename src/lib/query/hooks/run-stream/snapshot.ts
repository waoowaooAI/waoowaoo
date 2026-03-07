import type { RunState } from './types'

export const SNAPSHOT_TTL_MS = 1000 * 60 * 60 * 6

type RunSnapshot = {
  savedAt: number
  runState: RunState
}

export function loadRunSnapshot(storageKey: string): RunState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RunSnapshot
    if (!parsed || typeof parsed !== 'object') {
      window.sessionStorage.removeItem(storageKey)
      return null
    }
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > SNAPSHOT_TTL_MS) {
      window.sessionStorage.removeItem(storageKey)
      return null
    }
    const snapshotRunState = parsed.runState
    if (!snapshotRunState || typeof snapshotRunState !== 'object' || typeof snapshotRunState.runId !== 'string') {
      window.sessionStorage.removeItem(storageKey)
      return null
    }
    return snapshotRunState
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey)
    } catch { }
    return null
  }
}

export function saveRunSnapshot(storageKey: string, runState: RunState | null) {
  if (typeof window === 'undefined') return
  try {
    if (!runState) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    const snapshot: RunSnapshot = {
      savedAt: Date.now(),
      runState,
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot))
  } catch { }
}

export function clearRunSnapshot(storageKey: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch { }
}
