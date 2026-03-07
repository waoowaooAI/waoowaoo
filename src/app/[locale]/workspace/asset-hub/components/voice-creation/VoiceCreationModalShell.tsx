'use client'

import VoiceCreationModalLayout, { type VoiceCreationModalShellProps } from './VoiceCreationModalLayout'

export type { VoiceCreationModalShellProps }

export default function VoiceCreationModalShell(props: VoiceCreationModalShellProps) {
  return <VoiceCreationModalLayout {...props} />
}
