'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import { AppIcon } from '@/components/ui/icons'
import {
  useApproveProjectPlan,
  useProjectContext,
  useRejectProjectPlan,
} from '@/lib/query/hooks'
import type { RunStreamView } from '@/lib/query/hooks/run-stream/types'
import {
  ApprovalCard,
  ConfirmationActionCard,
  WorkflowPlanDataCard,
  useWorkspaceAssistantMessagePartComponents,
  WorkspaceAssistantThreadMessage,
} from './workspace-assistant/WorkspaceAssistantRenderers'
import {
  collectPendingApprovalActions,
  collectPendingConfirmationActions,
  collectWorkflowPlanSnapshots,
  removeApprovalRequestFromMessages,
  removeConfirmationRequestFromMessages,
} from './workspace-assistant/approval-state'
import { createAssistantMessage, createLocalMessage } from './workspace-assistant/workflow-timeline'
import { useWorkspaceAssistantRuntime } from './workspace-assistant/useWorkspaceAssistantRuntime'
import { getWorkflowDisplayLabel } from '@/lib/skill-system/project-workflow-machine'
import { WorkspaceAssistantModePicker } from './workspace-assistant/WorkspaceAssistantModePicker'
import { WorkspaceAssistantPanelHeader } from './workspace-assistant/WorkspaceAssistantPanelHeader'

interface WorkspaceAssistantPanelProps {
  projectId: string
  episodeId?: string
  currentStage: string
  storyToScriptStream: RunStreamView
  scriptToStoryboardStream: RunStreamView
}

const WORKSPACE_ASSISTANT_TOP_OFFSET = '10rem'

export default function WorkspaceAssistantPanel({
  projectId,
  episodeId,
  currentStage,
  storyToScriptStream,
  scriptToStoryboardStream,
}: WorkspaceAssistantPanelProps) {
  const t = useTranslations('assistantAgent')
  const [interactionMode, setInteractionMode] = useState<'auto' | 'plan' | 'fast'>('auto')
  const workflowLabels = useMemo(() => ({
    'story-to-script': getWorkflowDisplayLabel('story-to-script'),
    'script-to-storyboard': getWorkflowDisplayLabel('script-to-storyboard'),
  }), [])
  const { data: projectContext } = useProjectContext(projectId, {
    episodeId,
    currentStage,
  })
  const approvePlan = useApproveProjectPlan(projectId, episodeId)
  const rejectPlan = useRejectProjectPlan(projectId, episodeId)
  const assistantRuntime = useWorkspaceAssistantRuntime({
    projectId,
    episodeId,
    currentStage,
    interactionMode,
  })
  const pendingApprovalActions = useMemo(
    () => collectPendingApprovalActions(assistantRuntime.messages),
    [assistantRuntime.messages],
  )
  const pendingConfirmationActions = useMemo(
    () => collectPendingConfirmationActions(assistantRuntime.messages),
    [assistantRuntime.messages],
  )
  const workflowPlans = useMemo(
    () => collectWorkflowPlanSnapshots(assistantRuntime.messages),
    [assistantRuntime.messages],
  )
  const activePendingApproval = pendingApprovalActions[pendingApprovalActions.length - 1] || null
  const [selectedPendingActionKey, setSelectedPendingActionKey] = useState<string | null>(null)
  const pendingActionItems = [
    ...pendingApprovalActions.map((item) => ({
      key: `approval:${item.planId}`,
      label: workflowLabels[item.data.workflowId],
      kind: 'approval' as const,
      summary: item.data.summary,
    })),
    ...pendingConfirmationActions.map((item) => ({
      key: `confirm:${item.operationId}`,
      label: item.operationId,
      kind: 'confirmation' as const,
      summary: item.data.summary,
    })),
  ]
  const effectiveSelectedPendingActionKey = selectedPendingActionKey || pendingActionItems[pendingActionItems.length - 1]?.key || null
  const selectedPendingApproval = effectiveSelectedPendingActionKey?.startsWith('approval:')
    ? pendingApprovalActions.find((item) => `approval:${item.planId}` === effectiveSelectedPendingActionKey) || null
    : null
  const activePendingConfirmation = effectiveSelectedPendingActionKey?.startsWith('confirm:')
    ? pendingConfirmationActions.find((item) => `confirm:${item.operationId}` === effectiveSelectedPendingActionKey) || null
    : null
  const selectedPlan = workflowPlans.find((item) => item.planId === (selectedPendingApproval?.planId || '')) || null
  const handleApprovePlan = async (planId: string) => {
    const pendingApproval = pendingApprovalActions.find((item) => item.planId === planId) || null
    await approvePlan.mutateAsync(planId)
    const nextMessages = removeApprovalRequestFromMessages(assistantRuntime.messages, planId)
    assistantRuntime.replaceMessages([
      ...nextMessages,
      createAssistantMessage([
        {
          type: 'text',
          text: t('cards.approvedPlan', {
            workflow: pendingApproval ? workflowLabels[pendingApproval.data.workflowId] : currentStage,
          }),
        },
      ]),
    ])
  }
  const handleRejectPlan = async (params: { planId: string; note?: string }) => {
    const pendingApproval = pendingApprovalActions.find((item) => item.planId === params.planId) || null
    await rejectPlan.mutateAsync(params)
    const nextMessages = removeApprovalRequestFromMessages(assistantRuntime.messages, params.planId)
    assistantRuntime.replaceMessages([
      ...nextMessages,
      createAssistantMessage([
        {
          type: 'text',
          text: t('cards.rejectedPlan', {
            workflow: pendingApproval ? workflowLabels[pendingApproval.data.workflowId] : currentStage,
            reason: params.note?.trim() ? ` ${params.note.trim()}` : '',
          }),
        },
      ]),
    ])
  }
  const [confirmationSubmittingKey, setConfirmationSubmittingKey] = useState<string | null>(null)
  const handleConfirmOperation = async (operationId: string, argsHint?: Record<string, unknown> | null) => {
    setConfirmationSubmittingKey(`confirm:${operationId}:continue`)
    try {
      const nextMessages = removeConfirmationRequestFromMessages(assistantRuntime.messages, operationId)
      assistantRuntime.replaceMessages(nextMessages)
      await assistantRuntime.sendMessage(
        `我确认继续执行该操作。请继续调用 operation=${operationId}，并严格使用下面的参数（已包含 confirmed=true）：\n\n\`\`\`json\n${JSON.stringify(argsHint ?? { confirmed: true }, null, 2)}\n\`\`\``,
      )
    } finally {
      setConfirmationSubmittingKey(null)
    }
  }
  const handleCancelOperation = async (operationId: string) => {
    setConfirmationSubmittingKey(`confirm:${operationId}:cancel`)
    try {
      const nextMessages = removeConfirmationRequestFromMessages(assistantRuntime.messages, operationId)
      assistantRuntime.replaceMessages([
        ...nextMessages,
        createLocalMessage('assistant', [{
          type: 'text',
          text: `已取消待确认操作 ${operationId}。`,
        }]),
      ])
    } finally {
      setConfirmationSubmittingKey(null)
    }
  }
  const partComponents = useWorkspaceAssistantMessagePartComponents({
    storyToScriptStream,
    scriptToStoryboardStream,
    onConfirmOperation: handleConfirmOperation,
    onCancelOperation: handleCancelOperation,
    confirmationSubmittingKey,
  })
  const contextSummary = `${projectContext?.episodeName || episodeId || t('cards.globalScope')} · ${currentStage} · ${t('panel.runs', { count: projectContext?.activeRuns.length || 0 })}`
  const statusText = assistantRuntime.syncError
    || assistantRuntime.storageError
    || assistantRuntime.error?.message
    || (assistantRuntime.pending
      ? t('panel.streaming')
      : assistantRuntime.storageLoading
        ? t('panel.loading')
        : t('panel.statusReady'))
  const modeOptions = useMemo(() => ([
    {
      value: 'auto' as const,
      label: t('panel.modeAuto'),
      description: t('panel.modeDescriptionAuto'),
    },
    {
      value: 'plan' as const,
      label: t('panel.modePlan'),
      description: t('panel.modeDescriptionPlan'),
    },
    {
      value: 'fast' as const,
      label: t('panel.modeFast'),
      description: t('panel.modeDescriptionFast'),
    },
  ]), [t])
  const downloadHref = useMemo(() => {
    const search = new URLSearchParams()
    if (episodeId) search.set('episodeId', episodeId)
    return `/api/projects/${projectId}/assistant/chat/log?${search.toString()}`
  }, [episodeId, projectId])

  return (
    <aside className="relative w-[360px] shrink-0 self-stretch">
      <div
        className="fixed left-0 z-20 w-[360px] overflow-hidden rounded-r-3xl border border-l-0 border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 shadow-xl backdrop-blur-md"
        style={{
          top: WORKSPACE_ASSISTANT_TOP_OFFSET,
          height: `calc(100vh - ${WORKSPACE_ASSISTANT_TOP_OFFSET} - 1.5rem)`,
        }}
      >
        <AssistantRuntimeProvider runtime={assistantRuntime.runtime}>
          <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
            <WorkspaceAssistantPanelHeader
              eyebrow={t('panel.eyebrow')}
              title={t('panel.title')}
              episodeLabel={projectContext?.episodeName || episodeId || t('cards.globalScope')}
              stageLabel={currentStage}
              runLabel={t('panel.runs', { count: projectContext?.activeRuns.length || 0 })}
              downloadLabel={t('panel.downloadLog')}
              downloadHref={downloadHref}
            />

            <ThreadPrimitive.Viewport
              autoScroll
              className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0))] px-4 py-4"
            >
              {assistantRuntime.messageCount === 0 ? (
                <div className="mb-3 rounded-2xl bg-[var(--glass-bg-muted)]/70 px-3 py-4 text-sm text-[var(--glass-text-secondary)]">
                  {t('panel.empty')}
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.72)] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">
                        {t('panel.executionTraceTitle')}
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--glass-text-primary)]">
                        {assistantRuntime.pending ? t('panel.executionTraceRunning') : t('panel.executionTraceIdle')}
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                      assistantRuntime.pending
                        ? 'border-[rgba(59,130,246,0.26)] bg-[rgba(59,130,246,0.1)] text-[var(--glass-accent-from)]'
                        : 'border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.9)] text-[var(--glass-text-secondary)]'
                    }`}
                    >
                      <AppIcon name="cpu" className={`h-3.5 w-3.5 ${assistantRuntime.pending ? 'animate-pulse' : ''}`} />
                      <span>{statusText}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--glass-text-secondary)]">{contextSummary}</p>
                </div>
                {pendingActionItems.length > 0 ? (
                  <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/80 p-3">
                    <div className="mb-3 text-sm font-medium text-[var(--glass-text-primary)]">
                      {t('panel.pendingActionsTitle')}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {pendingActionItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={
                            effectiveSelectedPendingActionKey === item.key
                              ? 'rounded-full bg-[var(--glass-accent-from)] px-3 py-1.5 text-xs font-medium text-white'
                              : 'rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-1.5 text-xs text-[var(--glass-text-secondary)]'
                          }
                          onClick={() => setSelectedPendingActionKey(item.key)}
                        >
                          {item.kind === 'approval' ? t('panel.pendingApprovalChip', { label: item.label }) : t('panel.pendingConfirmationChip', { label: item.label })}
                        </button>
                      ))}
                    </div>
                    {selectedPendingApproval ? (
                      <div className="space-y-3">
                        {selectedPlan ? (
                          <WorkflowPlanDataCard
                            data={selectedPlan.data}
                            type="data"
                            name="workflow-plan"
                            status={{ type: 'complete' }}
                          />
                        ) : null}
                        <ApprovalCard
                          planId={selectedPendingApproval.planId}
                          summary={selectedPendingApproval.data.summary}
                          reasons={selectedPendingApproval.data.reasons}
                          onApprove={handleApprovePlan}
                          onReject={handleRejectPlan}
                          approvePending={approvePlan.isPending}
                          rejectPending={rejectPlan.isPending}
                        />
                      </div>
                    ) : activePendingConfirmation ? (
                      <ConfirmationActionCard
                        operationId={activePendingConfirmation.operationId}
                        summary={activePendingConfirmation.data.summary}
                        argsHint={activePendingConfirmation.data.argsHint ?? null}
                        onConfirm={async () => handleConfirmOperation(activePendingConfirmation.operationId, activePendingConfirmation.data.argsHint ?? null)}
                        onCancel={async () => handleCancelOperation(activePendingConfirmation.operationId)}
                        confirmPending={confirmationSubmittingKey === `confirm:${activePendingConfirmation.operationId}:continue`}
                        cancelPending={confirmationSubmittingKey === `confirm:${activePendingConfirmation.operationId}:cancel`}
                      />
                    ) : null}
                  </div>
                ) : null}
                <ThreadPrimitive.Messages>
                  {() => (
                    <WorkspaceAssistantThreadMessage messagePartComponents={partComponents} />
                  )}
                </ThreadPrimitive.Messages>

                {activePendingApproval && pendingActionItems.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/80 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('panel.pendingApprovalTitle')}</div>
                        <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">
                          {workflowLabels[activePendingApproval.data.workflowId]} · {t('panel.pendingApprovalCount', { count: pendingApprovalActions.length })}
                        </div>
                      </div>
                      <div className="rounded-full bg-[var(--glass-bg-surface)] px-2.5 py-1 text-xs text-[var(--glass-text-secondary)]">
                        {t('panel.latest')}
                      </div>
                    </div>
                    <ApprovalCard
                      planId={activePendingApproval.planId}
                      summary={activePendingApproval.data.summary}
                      reasons={activePendingApproval.data.reasons}
                      onApprove={handleApprovePlan}
                      onReject={handleRejectPlan}
                      approvePending={approvePlan.isPending}
                      rejectPending={rejectPlan.isPending}
                    />
                  </div>
                ) : null}
              </div>
            </ThreadPrimitive.Viewport>

            <div className="border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 px-4 py-4">
              <ComposerPrimitive.Root>
                <ComposerPrimitive.Input
                  placeholder={t('panel.composerPlaceholder')}
                  className="min-h-20 w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-3 text-sm text-[var(--glass-text-primary)] outline-none"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <WorkspaceAssistantModePicker
                      value={interactionMode}
                      options={modeOptions}
                      onChange={setInteractionMode}
                      label={t('panel.modeLabel')}
                    />
                    <div
                      className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs ${
                        assistantRuntime.error
                          ? 'border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] text-[rgba(239,68,68,0.92)]'
                          : assistantRuntime.pending
                            ? 'border-[rgba(59,130,246,0.22)] bg-[rgba(59,130,246,0.08)] text-[var(--glass-tone-info-fg)]'
                            : 'border-[rgba(34,197,94,0.22)] bg-[rgba(240,253,244,0.85)] text-[var(--glass-tone-success-fg)]'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${assistantRuntime.pending ? 'bg-[var(--glass-tone-info-fg)]' : 'bg-[var(--glass-tone-success-fg)]'}`} />
                      <span className="truncate">{statusText}</span>
                    </div>
                  </div>
                  <ComposerPrimitive.Send className="rounded-xl bg-[var(--glass-accent-from)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {assistantRuntime.pending ? t('panel.sending') : t('panel.send')}
                  </ComposerPrimitive.Send>
                </div>
                {assistantRuntime.error ? (
                  <div className="mt-2 text-xs text-[rgba(239,68,68,0.92)]">
                    {assistantRuntime.error.message || 'UNKNOWN_ERROR'} · <a href={downloadHref} className="underline">{t('panel.downloadLog')}</a>
                  </div>
                ) : null}
              </ComposerPrimitive.Root>
            </div>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </div>
    </aside>
  )
}
