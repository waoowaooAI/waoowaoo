'use client'

import LLMStageStreamCard, { type LLMStageViewItem } from '@/components/llm-console/LLMStageStreamCard'
import { useTranslations } from 'next-intl'

type RunStreamStep = {
  id: string
  title?: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'stale'
  retryable?: boolean
}

type RunStreamState = {
  status?: 'idle' | 'running' | 'completed' | 'failed'
  isVisible: boolean
  isRecoveredRunning: boolean
  stages: LLMStageViewItem[]
  selectedStep?: RunStreamStep | null
  activeStepId?: string | null
  outputText: string
  activeMessage?: string
  overallProgress: number
  isRunning: boolean
  errorMessage?: string
  stop: () => void
  reset: () => void
  selectStep: (stepId: string) => void
  retryStep: (params: { stepId: string; modelOverride?: string; reason?: string }) => Promise<{
    runId: string
    status: string
    summary: Record<string, unknown> | null
    payload: Record<string, unknown> | null
    errorMessage: string
  }>
  projectId?: string
  episodeId?: string | null
}

interface WorkspaceRunStreamConsolesProps {
  storyToScriptStream: RunStreamState
  scriptToStoryboardStream: RunStreamState
  storyToScriptConsoleMinimized: boolean
  scriptToStoryboardConsoleMinimized: boolean
  onStoryToScriptMinimizedChange: (next: boolean) => void
  onScriptToStoryboardMinimizedChange: (next: boolean) => void
  projectId: string
  episodeId?: string | null
  hideMinimizedBadges?: boolean
}

export default function WorkspaceRunStreamConsoles({
  storyToScriptStream,
  scriptToStoryboardStream,
  storyToScriptConsoleMinimized,
  scriptToStoryboardConsoleMinimized,
  onStoryToScriptMinimizedChange,
  onScriptToStoryboardMinimizedChange,
  projectId,
  episodeId,
  hideMinimizedBadges,
}: WorkspaceRunStreamConsolesProps) {
  const t = useTranslations('progress')
  const storyToScriptActive =
    storyToScriptStream.isRunning ||
    storyToScriptStream.isRecoveredRunning ||
    storyToScriptStream.status === 'running'
  const scriptToStoryboardActive =
    scriptToStoryboardStream.isRunning ||
    scriptToStoryboardStream.isRecoveredRunning ||
    scriptToStoryboardStream.status === 'running'

  const showStoryToScriptConsole =
    storyToScriptStream.isVisible &&
    (storyToScriptStream.stages.length > 0 || !!storyToScriptStream.errorMessage)
  const storyFallbackStatus: LLMStageViewItem['status'] =
    storyToScriptStream.status === 'failed' ? 'failed' : 'processing'
  const storyToScriptStages = storyToScriptStream.stages.length > 0
    ? storyToScriptStream.stages
    : [{
      id: 'story_to_script_run',
      title: t('runConsole.storyToScript'),
      status: storyFallbackStatus,
      progress: 0,
      subtitle: storyToScriptStream.errorMessage || undefined,
    }]
  const storyToScriptActiveStage = storyToScriptStream.activeStepId
    ? storyToScriptStages.find((stage) => stage.id === storyToScriptStream.activeStepId) || null
    : null
  const storyToScriptCardTitle =
    storyToScriptActiveStage?.title ||
    t('runConsole.storyToScript')
  const storyToScriptSelectedStageId =
    storyToScriptStream.selectedStep?.id || storyToScriptStream.activeStepId || null
  const storyToScriptSelectedStage = storyToScriptSelectedStageId
    ? storyToScriptStages.find((stage) => stage.id === storyToScriptSelectedStageId) || null
    : null
  const storyToScriptShowCursor =
    storyToScriptStream.isRunning &&
    storyToScriptStream.selectedStep?.id === storyToScriptStream.activeStepId &&
    storyToScriptSelectedStage?.status === 'processing'
  const showScriptToStoryboardConsole =
    scriptToStoryboardStream.isVisible &&
    (scriptToStoryboardStream.stages.length > 0 || !!scriptToStoryboardStream.errorMessage)
  const storyboardFallbackStatus: LLMStageViewItem['status'] =
    scriptToStoryboardStream.status === 'failed' ? 'failed' : 'processing'
  const scriptToStoryboardStages = scriptToStoryboardStream.stages.length > 0
    ? scriptToStoryboardStream.stages
    : [{
      id: 'script_to_storyboard_run',
      title: t('runConsole.scriptToStoryboard'),
      status: storyboardFallbackStatus,
      progress: 0,
      subtitle: scriptToStoryboardStream.errorMessage || undefined,
    }]
  const scriptToStoryboardActiveStage = scriptToStoryboardStream.activeStepId
    ? scriptToStoryboardStages.find((stage) => stage.id === scriptToStoryboardStream.activeStepId) || null
    : null
  const scriptToStoryboardCardTitle =
    scriptToStoryboardActiveStage?.title ||
    t('runConsole.scriptToStoryboard')
  const scriptToStoryboardSelectedStageId =
    scriptToStoryboardStream.selectedStep?.id || scriptToStoryboardStream.activeStepId || null
  const scriptToStoryboardSelectedStage = scriptToStoryboardSelectedStageId
    ? scriptToStoryboardStages.find((stage) => stage.id === scriptToStoryboardSelectedStageId) || null
    : null
  const scriptToStoryboardShowCursor =
    scriptToStoryboardStream.isRunning &&
    scriptToStoryboardStream.selectedStep?.id === scriptToStoryboardStream.activeStepId &&
    scriptToStoryboardSelectedStage?.status === 'processing'

  const handleRetryStepById = async (
    stream: RunStreamState,
    stepId: string,
  ) => {
    const input = typeof window !== 'undefined'
      ? window.prompt('可选：输入重试模型（留空使用当前模型）')
      : null
    const modelOverride = typeof input === 'string' ? input.trim() : ''
    await stream.retryStep({
      stepId,
      modelOverride: modelOverride || undefined,
      reason: 'user_retry_from_console',
    })
  }

  return (
    <>
      {!hideMinimizedBadges && showStoryToScriptConsole && storyToScriptConsoleMinimized && storyToScriptActive && (
        <button
          type="button"
          onClick={() => onStoryToScriptMinimizedChange(false)}
          className="fixed right-6 bottom-6 z-120 glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-(--glass-tone-info-fg)"
        >
          {t('runConsole.storyToScriptRunning')}
        </button>
      )}

      {showStoryToScriptConsole && !storyToScriptConsoleMinimized && (
        <div className="fixed inset-0 z-120 glass-overlay backdrop-blur-sm">
          <div className="mx-auto mt-4 h-[calc(100vh-2rem)] w-[min(96vw,1400px)]">
            <LLMStageStreamCard
              title={storyToScriptCardTitle}
              subtitle={t('runConsole.storyToScriptSubtitle')}
              stages={storyToScriptStages}
              activeStageId={storyToScriptStream.activeStepId || storyToScriptStages[storyToScriptStages.length - 1]?.id || ''}
              selectedStageId={storyToScriptStream.selectedStep?.id || undefined}
              onSelectStage={storyToScriptStream.selectStep}
              onRetryStage={(stepId) => {
                void handleRetryStepById(storyToScriptStream, stepId)
              }}
              outputText={storyToScriptStream.outputText}
              activeMessage={storyToScriptStream.activeMessage}
              overallProgress={storyToScriptStream.overallProgress}
              showCursor={storyToScriptShowCursor}
              autoScroll={storyToScriptStream.selectedStep?.id === storyToScriptStream.activeStepId}
              errorMessage={storyToScriptStream.errorMessage}
              feedbackStage="assets"
              projectId={projectId}
              episodeId={episodeId}
              topRightAction={(
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={storyToScriptStream.reset}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.stop')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStoryToScriptMinimizedChange(true)}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.minimize')}
                  </button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {!hideMinimizedBadges && showScriptToStoryboardConsole && scriptToStoryboardConsoleMinimized && scriptToStoryboardActive && (
        <button
          type="button"
          onClick={() => onScriptToStoryboardMinimizedChange(false)}
          className="fixed right-6 bottom-20 z-120 glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-(--glass-tone-info-fg)"
        >
          {t('runConsole.scriptToStoryboardRunning')}
        </button>
      )}

      {showScriptToStoryboardConsole && !scriptToStoryboardConsoleMinimized && (
        <div className="fixed inset-0 z-120 glass-overlay backdrop-blur-sm">
          <div className="mx-auto mt-4 h-[calc(100vh-2rem)] w-[min(96vw,1400px)]">
            <LLMStageStreamCard
              title={scriptToStoryboardCardTitle}
              subtitle={t('runConsole.scriptToStoryboardSubtitle')}
              stages={scriptToStoryboardStages}
              activeStageId={scriptToStoryboardStream.activeStepId || scriptToStoryboardStages[scriptToStoryboardStages.length - 1]?.id || ''}
              selectedStageId={scriptToStoryboardStream.selectedStep?.id || undefined}
              onSelectStage={scriptToStoryboardStream.selectStep}
              onRetryStage={(stepId) => {
                void handleRetryStepById(scriptToStoryboardStream, stepId)
              }}
              outputText={scriptToStoryboardStream.outputText}
              activeMessage={scriptToStoryboardStream.activeMessage}
              overallProgress={scriptToStoryboardStream.overallProgress}
              showCursor={scriptToStoryboardShowCursor}
              autoScroll={scriptToStoryboardStream.selectedStep?.id === scriptToStoryboardStream.activeStepId}
              errorMessage={scriptToStoryboardStream.errorMessage}
              feedbackStage="storyboard"
              projectId={projectId}
              episodeId={episodeId}
              topRightAction={(
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={scriptToStoryboardStream.reset}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.stop')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onScriptToStoryboardMinimizedChange(true)}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.minimize')}
                  </button>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </>
  )
}
