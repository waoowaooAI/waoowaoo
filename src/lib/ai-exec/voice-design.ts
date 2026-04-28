import { getProviderConfig } from '@/lib/user-api/runtime-config'
import {
  createVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
  type VoiceDesignInput,
  type VoiceDesignResult,
} from '@/lib/ai-providers/bailian/voice-design'

export { validatePreviewText, validateVoicePrompt }
export type { VoiceDesignInput, VoiceDesignResult }

export async function createBailianVoiceDesignForUser(input: {
  userId: string
  voiceDesign: VoiceDesignInput
}): Promise<VoiceDesignResult> {
  const { apiKey } = await getProviderConfig(input.userId, 'bailian')
  return await createVoiceDesign(input.voiceDesign, apiKey)
}
