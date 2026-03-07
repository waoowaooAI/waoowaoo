'use client'

import VoiceStageLayout, { type VoiceStageShellProps } from './VoiceStageLayout'

export type { VoiceStageShellProps }

export default function VoiceStageShell(props: VoiceStageShellProps) {
  return <VoiceStageLayout {...props} />
}
