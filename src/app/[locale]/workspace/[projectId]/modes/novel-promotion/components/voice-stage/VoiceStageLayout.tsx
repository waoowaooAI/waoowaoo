'use client'

import { useVoiceStageRuntime, type VoiceStageShellProps } from './hooks/useVoiceStageRuntime'

export type { VoiceStageShellProps }

export default function VoiceStageLayout(props: VoiceStageShellProps) {
  return useVoiceStageRuntime(props)
}
