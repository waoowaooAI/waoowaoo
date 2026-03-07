export type BailianProviderKey = 'bailian'

export interface BailianGenerateRequestOptions {
  provider: string
  modelId: string
  modelKey: string
  [key: string]: unknown
}

export interface BailianLlmMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface BailianProbeStep {
  name: 'models' | 'credits'
  status: 'pass' | 'fail' | 'skip'
  message: string
  detail?: string
}

export interface BailianProbeResult {
  success: boolean
  steps: BailianProbeStep[]
}
