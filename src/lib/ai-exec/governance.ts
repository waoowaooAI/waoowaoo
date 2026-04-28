import { normalizeAnyError } from '@/lib/errors/normalize'
import type { AiRuntimeError, AiRuntimeErrorCode } from '@/lib/ai-registry/types'

type ConcurrencyScope = 'image' | 'video'

interface GateState {
  active: number
  waitingResolvers: Array<() => void>
}

const gateStateMap = new Map<string, GateState>()

type ConcurrencyGateMode = 'memory' | 'redis'

function resolveConcurrencyGateMode(): ConcurrencyGateMode {
  const raw = process.env.AI_CONCURRENCY_GATE_MODE
  if (!raw || raw === 'memory') return 'memory'
  if (raw === 'redis') return 'redis'
  throw new Error(`AI_CONCURRENCY_GATE_MODE_INVALID: ${raw}`)
}

function resolveRedisGateTtlMs(): number {
  const raw = process.env.AI_CONCURRENCY_GATE_TTL_MS
  if (!raw) return 30 * 60 * 1000
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 60_000) {
    throw new Error(`AI_CONCURRENCY_GATE_TTL_MS_INVALID: ${raw}`)
  }
  return parsed
}

function getGateState(key: string): GateState {
  const existing = gateStateMap.get(key)
  if (existing) return existing
  const created: GateState = { active: 0, waitingResolvers: [] }
  gateStateMap.set(key, created)
  return created
}

function cleanupGateStateIfIdle(key: string) {
  const state = gateStateMap.get(key)
  if (!state) return
  if (state.active === 0 && state.waitingResolvers.length === 0) {
    gateStateMap.delete(key)
  }
}

async function acquireConcurrencySlot(key: string, limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`WORKFLOW_CONCURRENCY_INVALID: ${limit}`)
  }

  const state = getGateState(key)
  if (state.active < limit) {
    state.active += 1
    return
  }

  await new Promise<void>((resolve) => {
    state.waitingResolvers.push(resolve)
  })
}

function releaseConcurrencySlot(key: string) {
  const state = gateStateMap.get(key)
  if (!state) return

  if (state.waitingResolvers.length > 0) {
    const nextResolver = state.waitingResolvers.shift()
    nextResolver?.()
    return
  }

  state.active = Math.max(0, state.active - 1)
  cleanupGateStateIfIdle(key)
}

async function acquireConcurrencySlotRedis(input: {
  key: string
  limit: number
  ttlMs: number
}): Promise<{ stopHeartbeat: () => void; release: () => Promise<void> }> {
  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    throw new Error(`WORKFLOW_CONCURRENCY_INVALID: ${input.limit}`)
  }

  const { queueRedis } = await import('@/lib/redis')
  const acquireScript = [
    'local key=KEYS[1]',
    'local limit=tonumber(ARGV[1])',
    'local ttl=tonumber(ARGV[2])',
    "local current=tonumber(redis.call('GET', key) or '0')",
    'if current < limit then',
    "  redis.call('INCR', key)",
    "  redis.call('PEXPIRE', key, ttl)",
    '  return 1',
    'end',
    'return 0',
  ].join('\n')

  const releaseScript = [
    'local key=KEYS[1]',
    "local current=tonumber(redis.call('GET', key) or '0')",
    'if current <= 0 then',
    '  return 0',
    'end',
    "local next=tonumber(redis.call('DECR', key) or '0')",
    'if next <= 0 then',
    "  redis.call('DEL', key)",
    'end',
    'return next',
  ].join('\n')

  let attempt = 0
  while (true) {
    attempt += 1
    const acquired = await queueRedis.eval(acquireScript, 1, input.key, String(input.limit), String(input.ttlMs)) as unknown
    if (acquired === 1 || acquired === '1') break
    const delayMs = Math.min(200 * attempt, 1000)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const heartbeat = setInterval(() => {
    void queueRedis.pexpire(input.key, input.ttlMs).catch(() => undefined)
  }, Math.max(10_000, Math.floor(input.ttlMs / 2)))

  return {
    stopHeartbeat: () => clearInterval(heartbeat),
    release: async () => {
      await queueRedis.eval(releaseScript, 1, input.key)
    },
  }
}

export function computeRetryDelay(input: {
  attempt: number
  kind: 'llm' | 'vision' | 'worker'
}): number {
  if (input.kind === 'vision') {
    return Math.min(1000 * Math.pow(2, input.attempt - 1), 5000)
  }
  if (input.kind === 'worker') {
    return Math.min(1000 * Math.pow(2, input.attempt - 1), 5000)
  }
  return Math.min(1000 * Math.pow(2, input.attempt - 1), 5000)
}

export async function waitForRetryDelay(input: {
  attempt: number
  kind: 'llm' | 'vision' | 'worker'
}): Promise<void> {
  const delayMs = computeRetryDelay(input)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

export async function withAiConcurrencyGate<T>(input: {
  scope: ConcurrencyScope
  userId: string
  limit: number
  run: () => Promise<T>
}): Promise<T> {
  const mode = resolveConcurrencyGateMode()
  const key = `${input.scope}:${input.userId}`

  if (mode === 'redis') {
    const redisKey = `ai_concurrency_gate:${key}`
    const gate = await acquireConcurrencySlotRedis({
      key: redisKey,
      limit: input.limit,
      ttlMs: resolveRedisGateTtlMs(),
    })
    try {
      return await input.run()
    } finally {
      gate.stopHeartbeat()
      await gate.release()
    }
  }

  await acquireConcurrencySlot(key, input.limit)
  try {
    return await input.run()
  } finally {
    releaseConcurrencySlot(key)
  }
}

function toAiRuntimeErrorCode(value: string): AiRuntimeErrorCode {
  if (value === 'NETWORK_ERROR') return 'NETWORK_ERROR'
  if (value === 'RATE_LIMIT') return 'RATE_LIMIT'
  if (value === 'EMPTY_RESPONSE') return 'EMPTY_RESPONSE'
  if (value === 'GENERATION_TIMEOUT') return 'TIMEOUT'
  if (value === 'SENSITIVE_CONTENT') return 'SENSITIVE_CONTENT'
  if (value === 'PARSING_ERROR') return 'PARSE_ERROR'
  return 'INTERNAL_ERROR'
}

function inferEmptyResponseSignal(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('stream_empty')
    || normalized.includes('empty response')
    || normalized.includes('no meaningful content')
    || normalized.includes('channel:empty_response')
}

function hasNestedEmptyResponseSignal(input: unknown): boolean {
  const queue: unknown[] = [input]
  const visited = new Set<object>()
  let scannedCount = 0

  while (queue.length > 0 && scannedCount < 100) {
    const current = queue.shift()
    scannedCount += 1
    if (current === null || current === undefined) continue

    if (typeof current === 'string') {
      if (inferEmptyResponseSignal(current)) return true
      continue
    }

    if (current instanceof Error) {
      if (inferEmptyResponseSignal(current.message || '')) return true
      const errorWithCause = current as Error & { cause?: unknown } & { [key: string]: unknown }
      queue.push(errorWithCause.cause)
      queue.push(errorWithCause.error)
      queue.push(errorWithCause.details)
      queue.push(errorWithCause.response)
      continue
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item)
      }
      continue
    }

    if (typeof current !== 'object') {
      continue
    }

    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    const record = current as { [key: string]: unknown }
    for (const value of Object.values(record)) {
      queue.push(value)
    }
  }

  return false
}

export function toAiRuntimeError(input: unknown): AiRuntimeError {
  const normalized = normalizeAnyError(input, { context: 'worker' })
  const message = normalized.message || 'AI request failed'
  const isEmptyResponse = inferEmptyResponseSignal(message) || hasNestedEmptyResponseSignal(input)
  const code = isEmptyResponse
    ? 'EMPTY_RESPONSE'
    : toAiRuntimeErrorCode(normalized.code)

  const error = new Error(message) as AiRuntimeError
  error.code = code
  error.retryable = code === 'EMPTY_RESPONSE' ? true : normalized.retryable
  error.provider = normalized.provider || null
  error.cause = input
  return error
}
