'use client'

import PromptsStageShell, { type PromptsStageShellProps } from './prompts-stage/PromptsStageShell'

export type { PromptsStageShellProps as PromptsStageProps } from './prompts-stage/PromptsStageShell'

export default function PromptsStage(props: PromptsStageShellProps) {
  return <PromptsStageShell {...props} />
}
