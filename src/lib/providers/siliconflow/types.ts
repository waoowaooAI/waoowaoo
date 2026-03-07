export type SiliconFlowProviderKey = 'siliconflow'

export interface SiliconFlowGenerateRequestOptions {
  provider: string
  modelId: string
  modelKey: string
  [key: string]: unknown
}

export interface SiliconFlowLlmMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface SiliconFlowProbeStep {
  name: 'models' | 'credits'
  status: 'pass' | 'fail' | 'skip'
  message: string
  detail?: string
}

export interface SiliconFlowProbeResult {
  success: boolean
  steps: SiliconFlowProbeStep[]
}
