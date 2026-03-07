import { isRetryablePrismaError } from '@/lib/prisma-error'

type PrismaRetryOptions = {
  maxRetries?: number
  initialDelayMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toRetryCount(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized < 0) return 0
  return normalized
}

function toDelay(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized < 0) return 0
  return normalized
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options: PrismaRetryOptions = {},
): Promise<T> {
  const maxRetries = toRetryCount(options.maxRetries, 2)
  const initialDelayMs = toDelay(options.initialDelayMs, 80)

  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryablePrismaError(error) || attempt >= maxRetries) {
        throw error
      }
      const backoffMs = initialDelayMs * (attempt + 1)
      if (backoffMs > 0) {
        await sleep(backoffMs)
      }
      attempt += 1
    }
  }
}
