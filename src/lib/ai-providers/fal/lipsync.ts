import { submitFalTask } from './queue'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type { AiLipSyncParams, AiLipSyncResult, AiLipSyncSubmitContext } from '@/lib/ai-registry/types'

export async function submitFalLipSync(
  params: AiLipSyncParams,
  context: AiLipSyncSubmitContext,
): Promise<AiLipSyncResult> {
  const endpoint = context.modelId.trim()
  if (!endpoint) {
    throw new Error(`LIPSYNC_ENDPOINT_MISSING: ${context.modelKey}`)
  }

  const videoDataUrl = params.videoUrl.startsWith('data:')
    ? params.videoUrl
    : await normalizeToBase64ForGeneration(params.videoUrl)
  const audioDataUrl = params.audioUrl.startsWith('data:')
    ? params.audioUrl
    : await normalizeToBase64ForGeneration(params.audioUrl)

  const { apiKey } = await getProviderConfig(context.userId, context.providerId)
  const requestId = await submitFalTask(endpoint, {
    video_url: videoDataUrl,
    audio_url: audioDataUrl,
  }, apiKey)

  return {
    requestId,
    externalId: `FAL:VIDEO:${endpoint}:${requestId}`,
    async: true,
  }
}
