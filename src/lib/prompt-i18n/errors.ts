import type { PromptId } from './prompt-ids'

export type PromptI18nErrorCode =
  | 'PROMPT_ID_UNREGISTERED'
  | 'PROMPT_TEMPLATE_NOT_FOUND'
  | 'PROMPT_VARIABLE_MISSING'
  | 'PROMPT_VARIABLE_UNEXPECTED'
  | 'PROMPT_VARIABLE_VALUE_INVALID'
  | 'PROMPT_PLACEHOLDER_MISMATCH'

export class PromptI18nError extends Error {
  readonly code: PromptI18nErrorCode
  readonly promptId: PromptId
  readonly details?: Record<string, unknown>

  constructor(
    code: PromptI18nErrorCode,
    promptId: PromptId,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'PromptI18nError'
    this.code = code
    this.promptId = promptId
    this.details = details
  }
}
