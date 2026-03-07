export type AssistantPlatformErrorCode =
  | 'ASSISTANT_INVALID_REQUEST'
  | 'ASSISTANT_UNSUPPORTED_PROVIDER'
  | 'ASSISTANT_MODEL_NOT_CONFIGURED'
  | 'ASSISTANT_MODEL_PROVIDER_UNSUPPORTED'
  | 'ASSISTANT_CONTEXT_REQUIRED'
  | 'ASSISTANT_SKILL_NOT_FOUND'

export class AssistantPlatformError extends Error {
  readonly code: AssistantPlatformErrorCode

  constructor(code: AssistantPlatformErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'AssistantPlatformError'
  }
}
