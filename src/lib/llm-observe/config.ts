export type LLMObserveDisplayMode = 'loading' | 'detail'

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback
  const v = value.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return fallback
}

function parseNumber(value: string | undefined, fallback: number) {
  if (value == null) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

function parseMode(value: string | undefined, fallback: LLMObserveDisplayMode): LLMObserveDisplayMode {
  if (value === 'detail' || value === 'loading') return value
  return fallback
}

export const LLM_OBSERVE_ENABLED = parseBoolean(
  process.env.LLM_OBSERVE_ENABLED ?? process.env.NEXT_PUBLIC_LLM_OBSERVE_ENABLED,
  true,
)
export const LLM_OBSERVE_DEFAULT_MODE = parseMode(
  process.env.LLM_OBSERVE_DEFAULT_MODE ?? process.env.NEXT_PUBLIC_LLM_OBSERVE_DEFAULT_MODE,
  'loading',
)
export const LLM_OBSERVE_LONG_TASK_THRESHOLD_MS = parseNumber(
  process.env.LLM_OBSERVE_LONG_TASK_THRESHOLD_MS ?? process.env.NEXT_PUBLIC_LLM_OBSERVE_LONG_TASK_THRESHOLD_MS,
  8000,
)
export const LLM_OBSERVE_REASONING_VISIBLE = parseBoolean(
  process.env.LLM_OBSERVE_REASONING_VISIBLE ?? process.env.NEXT_PUBLIC_LLM_OBSERVE_REASONING_VISIBLE,
  true,
)
export const INTERNAL_TASK_TOKEN = process.env.INTERNAL_TASK_TOKEN || ''
export const INTERNAL_TASK_API_BASE_URL = process.env.INTERNAL_TASK_API_BASE_URL || process.env.NEXTAUTH_URL || 'http://127.0.0.1:3000'
