'use client'

import { useVideoStageRuntime, type VideoStageShellProps } from './hooks/useVideoStageRuntime'

export type { VideoStageShellProps }

export default function VideoStageLayout(props: VideoStageShellProps) {
  return useVideoStageRuntime(props)
}
