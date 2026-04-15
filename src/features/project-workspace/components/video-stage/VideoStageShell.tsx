'use client'

import VideoStageLayout, { type VideoStageShellProps } from './VideoStageLayout'

export type { VideoStageShellProps }

export default function VideoStageShell(props: VideoStageShellProps) {
  return <VideoStageLayout {...props} />
}
