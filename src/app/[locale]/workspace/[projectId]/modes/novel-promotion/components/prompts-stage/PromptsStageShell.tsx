'use client'

import PromptsStageLayout, { type PromptsStageShellProps } from './PromptsStageLayout'

export type { PromptsStageShellProps }

export default function PromptsStageShell(props: PromptsStageShellProps) {
  return <PromptsStageLayout {...props} />
}
