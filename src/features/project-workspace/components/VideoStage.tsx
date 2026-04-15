'use client'

import VideoStageShell, { type VideoStageShellProps } from './video-stage/VideoStageShell'

export type { VideoStageShellProps as VideoStageProps } from './video-stage/VideoStageShell'

export default function VideoStage(props: VideoStageShellProps) {
  return <VideoStageShell {...props} />
}
