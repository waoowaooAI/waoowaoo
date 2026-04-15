'use client'

import { useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import {
  useApproveProjectPlan,
  useProjectContext,
  useRejectProjectPlan,
} from '@/lib/query/hooks'
import type { RunStreamView } from '@/lib/query/hooks/run-stream/types'
import {
  ApprovalCard,
  useWorkspaceAssistantMessagePartComponents,
  WorkspaceAssistantThreadMessage,
} from './workspace-assistant/WorkspaceAssistantRenderers'
import { collectPendingApprovalActions, removeApprovalRequestFromMessages } from './workspace-assistant/approval-state'
import { createLocalMessage } from './workspace-assistant/workflow-timeline'
import { useWorkspaceAssistantRuntime } from './workspace-assistant/useWorkspaceAssistantRuntime'
import { getWorkflowDisplayLabel } from '@/lib/skill-system/project-workflow-machine'

interface WorkspaceAssistantPanelProps {
  projectId: string
  episodeId?: string
  currentStage: string
  storyToScriptStream: RunStreamView
  scriptToStoryboardStream: RunStreamView
}

export default function WorkspaceAssistantPanel({
  projectId,
  episodeId,
  currentStage,
  storyToScriptStream,
  scriptToStoryboardStream,
}: WorkspaceAssistantPanelProps) {
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
  })
  const pendingApprovalActions = useMemo(
    () => collectPendingApprovalActions(assistantRuntime.messages),
    [assistantRuntime.messages],
  )
  const activePendingApproval = pendingApprovalActions[pendingApprovalActions.length - 1] || null
  const partComponents = useWorkspaceAssistantMessagePartComponents({
    storyToScriptStream,
    scriptToStoryboardStream,
  })
  const handleApprovePlan = async (planId: string) => {
    const pendingApproval = pendingApprovalActions.find((item) => item.planId === planId) || null
    const result = await approvePlan.mutateAsync(planId)
    const nextMessages = removeApprovalRequestFromMessages(assistantRuntime.messages, planId)
    assistantRuntime.replaceMessages([
      ...nextMessages,
      createLocalMessage('assistant', [
        {
          type: 'text',
          text: `已批准 ${pendingApproval ? workflowLabels[pendingApproval.data.workflowId] : '当前'} 计划，正在开始执行。`,
        },
        {
          type: 'data-workflow-status',
          data: {
            workflowId: pendingApproval?.data.workflowId || 'story-to-script',
            commandId: result.commandId,
            planId: result.planId,
            runId: result.runId,
            status: result.status,
          },
        },
      ]),
    ])
  }
  const handleRejectPlan = async (params: { planId: string; note?: string }) => {
    const pendingApproval = pendingApprovalActions.find((item) => item.planId === params.planId) || null
    const result = await rejectPlan.mutateAsync(params)
    const nextMessages = removeApprovalRequestFromMessages(assistantRuntime.messages, params.planId)
    assistantRuntime.replaceMessages([
      ...nextMessages,
      createLocalMessage('assistant', [
        {
          type: 'text',
          text: `已拒绝 ${pendingApproval ? workflowLabels[pendingApproval.data.workflowId] : '当前'} 计划。${params.note?.trim() ? ` 原因：${params.note.trim()}` : ''}`,
        },
        {
          type: 'data-workflow-status',
          data: {
            workflowId: pendingApproval?.data.workflowId || 'story-to-script',
            commandId: result.commandId,
            planId: result.planId,
            runId: result.runId,
            status: result.status,
          },
        },
      ]),
    ])
  }
  const contextSummary = `${projectContext?.episodeName || episodeId || '未选择剧集'} · ${currentStage} · ${projectContext?.activeRuns.length || 0} 个运行中`
  const statusText = assistantRuntime.syncError
    || assistantRuntime.storageError
    || assistantRuntime.error?.message
    || (assistantRuntime.pending
      ? 'Streaming'
      : assistantRuntime.storageLoading
        ? 'Loading'
        : 'Ready')

  return (
    <aside className="relative w-[360px] shrink-0 self-stretch">
      <div className="fixed left-0 top-24 z-20 h-[calc(100vh-6.5rem)] w-[360px] overflow-hidden rounded-r-3xl border border-l-0 border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 shadow-xl backdrop-blur-md">
        <AssistantRuntimeProvider runtime={assistantRuntime.runtime}>
          <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[var(--glass-stroke-base)] bg-[linear-gradient(180deg,rgba(59,130,246,0.1),rgba(59,130,246,0))] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--glass-text-tertiary)]">AI Assistant</p>
                  <h2 className="mt-2 text-lg font-semibold text-[var(--glass-text-primary)]">Workspace Chat</h2>
                </div>
                <div className="rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-1 text-xs text-[var(--glass-text-secondary)]">
                  {assistantRuntime.pending ? '执行中' : '就绪'}
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--glass-text-secondary)]">{contextSummary}</p>
            </div>

            <ThreadPrimitive.Viewport
              autoScroll
              className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0))] px-4 py-4"
            >
              {assistantRuntime.messageCount === 0 ? (
                <div className="mb-3 rounded-2xl bg-[var(--glass-bg-muted)]/70 px-3 py-4 text-sm text-[var(--glass-text-secondary)]">
                  这里是唯一的工作台。无论你从左侧聊天还是原来的开始创作入口触发，workflow 计划、审批、skill 进度和结果都会汇总在这里。
                </div>
              ) : null}

              <div className="space-y-3">
                <ThreadPrimitive.Messages>
                  {() => (
                    <WorkspaceAssistantThreadMessage messagePartComponents={partComponents} />
                  )}
                </ThreadPrimitive.Messages>

                {activePendingApproval ? (
                  <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/80 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[var(--glass-text-primary)]">待处理审批</div>
                        <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">
                          {workflowLabels[activePendingApproval.data.workflowId]} · {pendingApprovalActions.length} 个待处理动作
                        </div>
                      </div>
                      <div className="rounded-full bg-[var(--glass-bg-surface)] px-2.5 py-1 text-xs text-[var(--glass-text-secondary)]">
                        Latest
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
                  placeholder="询问当前进度、审批原因、下一步，或让助手解释这次 workflow。"
                  className="min-h-20 w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-3 text-sm text-[var(--glass-text-primary)] outline-none"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--glass-text-tertiary)]">{statusText}</div>
                  <ComposerPrimitive.Send className="rounded-xl bg-[var(--glass-accent-from)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {assistantRuntime.pending ? '发送中...' : '发送'}
                  </ComposerPrimitive.Send>
                </div>
              </ComposerPrimitive.Root>
            </div>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </div>
    </aside>
  )
}
