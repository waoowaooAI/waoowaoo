type PrismaLikeError = {
  code?: unknown
  message?: unknown
}

const PRISMA_CODE_PATTERN = /^P\d{4}$/i

const RETRYABLE_PRISMA_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
])

function toMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return ''
}

export function isPrismaErrorCode(value: unknown): value is string {
  return typeof value === 'string' && PRISMA_CODE_PATTERN.test(value.trim())
}

export function getPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as PrismaLikeError).code
  if (!isPrismaErrorCode(code)) return null
  return code.trim().toUpperCase()
}

export function isPrismaRetryableCode(code: string): boolean {
  return RETRYABLE_PRISMA_CODES.has(code.trim().toUpperCase())
}

export function isLikelyPrismaDisconnectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = toMessage((error as PrismaLikeError).message).toLowerCase()
  if (!message) return false
  return (
    message.includes('server has closed the connection')
    || message.includes('unable to start a transaction in the given time')
    || message.includes('connection timed out')
    || message.includes("can't reach database server")
  )
}

export function isRetryablePrismaError(error: unknown): boolean {
  const code = getPrismaErrorCode(error)
  if (code && isPrismaRetryableCode(code)) return true
  return isLikelyPrismaDisconnectError(error)
}
