import { resolveErrorDisplay } from '@/lib/errors/display'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { VideoPanelCardShellProps } from '../../types'

interface UsePanelTaskStatusParams {
  panel: VideoPanelCardShellProps['panel']
  hasVisibleBaseVideo: boolean
  tCommon: (key: string) => string
}

export function usePanelTaskStatus({ panel, hasVisibleBaseVideo, tCommon }: UsePanelTaskStatusParams) {
  const isVideoTaskRunning = !!panel.videoTaskRunning
  const isLipSyncTaskRunning = !!panel.lipSyncTaskRunning
  const panelErrorDisplay = resolveErrorDisplay({
    code: panel.videoErrorMessage || panel.lipSyncErrorMessage || null,
    message: panel.videoErrorMessage || panel.lipSyncErrorMessage || null,
  })

  const videoRunningPresentation = isVideoTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: hasVisibleBaseVideo ? 'regenerate' : 'generate',
      resource: 'video',
      hasOutput: hasVisibleBaseVideo,
    })
    : null

  const lipSyncRunningPresentation = isLipSyncTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'video',
      hasOutput: !!panel.lipSyncVideoUrl || hasVisibleBaseVideo,
    })
    : null

  const taskRunningVideoLabel = isLipSyncTaskRunning
    ? (lipSyncRunningPresentation?.labelKey
      ? tCommon(lipSyncRunningPresentation.labelKey)
      : tCommon('taskStatus.intent.process.running.video'))
    : (videoRunningPresentation?.labelKey
      ? tCommon(videoRunningPresentation.labelKey)
      : tCommon('taskStatus.intent.generate.running.video'))

  const overlayPresentation = (() => {
    if (!isVideoTaskRunning && !isLipSyncTaskRunning) return null
    if (isLipSyncTaskRunning) {
      return (
        lipSyncRunningPresentation ||
        resolveTaskPresentationState({
          phase: 'processing',
          intent: 'process',
          resource: 'video',
          hasOutput: !!panel.lipSyncVideoUrl || hasVisibleBaseVideo,
        })
      )
    }
    return (
      videoRunningPresentation ||
      resolveTaskPresentationState({
        phase: 'processing',
        intent: 'generate',
        resource: 'video',
        hasOutput: hasVisibleBaseVideo,
      })
    )
  })()

  const lipSyncInlineState = resolveTaskPresentationState({
    phase: 'processing',
    intent: 'process',
    resource: 'video',
    hasOutput: !!panel.lipSyncVideoUrl || hasVisibleBaseVideo,
  })

  return {
    isVideoTaskRunning,
    isLipSyncTaskRunning,
    panelErrorDisplay,
    videoRunningPresentation,
    lipSyncRunningPresentation,
    taskRunningVideoLabel,
    overlayPresentation,
    lipSyncInlineState,
  }
}
