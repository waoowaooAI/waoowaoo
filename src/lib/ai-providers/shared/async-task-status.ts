export interface ProviderAsyncTaskStatus {
  status: 'pending' | 'completed' | 'failed'
  imageUrl?: string
  videoUrl?: string
  actualVideoTokens?: number
  error?: string
}

