export interface LipSyncResult {
  videoUrl?: string
  requestId: string
  externalId?: string
  async?: boolean
}

export interface LipSyncParams {
  videoUrl: string
  audioUrl: string
  audioDurationMs?: number | null
  videoDurationMs?: number | null
}

export interface LipSyncSubmitContext {
  userId: string
  providerId: string
  modelId: string
  modelKey: string
}
