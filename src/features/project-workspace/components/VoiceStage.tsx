'use client'

import VoiceStageShell, { type VoiceStageShellProps } from './voice-stage/VoiceStageShell'

export type { VoiceStageShellProps as VoiceStageProps } from './voice-stage/VoiceStageShell'

export default function VoiceStage(props: VoiceStageShellProps) {
  return <VoiceStageShell {...props} />
}
