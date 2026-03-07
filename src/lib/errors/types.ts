import type { ErrorCategory, UnifiedErrorCode } from './codes'

export type ErrorContext = 'api' | 'worker'

export type NormalizedErrorDetails = Record<string, unknown> | null

export type NormalizedError = {
  code: UnifiedErrorCode
  message: string
  httpStatus: number
  retryable: boolean
  category: ErrorCategory
  userMessageKey: string
  details: NormalizedErrorDetails
  provider?: string | null
}
