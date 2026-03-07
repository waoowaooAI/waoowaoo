'use client'

import VoiceCreationModalShell, { type VoiceCreationModalShellProps } from './voice-creation/VoiceCreationModalShell'

export type { VoiceCreationModalShellProps as VoiceCreationModalProps } from './voice-creation/VoiceCreationModalShell'

export default function VoiceCreationModal(props: VoiceCreationModalShellProps) {
  return <VoiceCreationModalShell {...props} />
}
