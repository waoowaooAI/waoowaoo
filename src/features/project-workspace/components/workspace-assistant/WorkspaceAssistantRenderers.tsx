'use client'

import React from 'react'
import {
  MessagePrimitive,
  type DataMessagePartProps,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { ComponentProps } from 'react'
import { useMemo, useState } from 'react'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import type {
  ApprovalRequestPartData,
  ConfirmationRequestPartData,
  ProjectContextPartData,
  ProjectPhasePartData,
  ScriptPreviewPartData,
  StoryboardPreviewPartData,
  WorkflowPlanPartData,
  WorkflowStatusPartData,
} from '@/lib/project-agent/types'
import type { RunStreamView } from '@/lib/query/hooks/run-stream/types'
import {
  getSkillDisplayLabel,
  getWorkflowDisplayLabel,
} from '@/lib/skill-system/project-workflow-machine'

function formatSkillLabel(skillId: string | null | undefined): string {
  return getSkillDisplayLabel(skillId)
}

function formatScopeRef(scopeRef: string | null | undefined): string {
  if (!scopeRef) return '全局'
  if (scopeRef.startsWith('episode:')) return `Episode ${scopeRef.slice('episode:'.length)}`
  if (scopeRef.startsWith('clip:')) return `Clip ${scopeRef.slice('clip:'.length)}`
  if (scopeRef.startsWith('panel:')) return `Panel ${scopeRef.slice('panel:'.length)}`
  return scopeRef
}

type MessagePartComponents = NonNullable<ComponentProps<typeof MessagePrimitive.Parts>['components']>

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

export function WorkflowStatusCard(props: {
  title: string
  stream: RunStreamView
  fallbackStatus: string
}) {
  const activeStep = props.stream.orderedSteps.find((step) => step.id === props.stream.activeStepId)
    || props.stream.orderedSteps[0]
    || null

  const normalizedFallbackStatus = props.fallbackStatus.trim().toLowerCase()
  const derivedPercent = props.stream.status === 'idle'
    ? normalizedFallbackStatus === 'completed'
      ? 100
      : normalizedFallbackStatus === 'failed'
        ? 0
        : 0
    : Math.max(0, Math.min(100, Math.round(props.stream.overallProgress || 0)))
  const derivedStatusText = props.stream.status === 'idle' ? props.fallbackStatus : props.stream.status

  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--glass-text-primary)]">{props.title}</div>
          <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">
            {derivedStatusText}
          </div>
        </div>
        <div className="rounded-full bg-[var(--glass-bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--glass-text-primary)]">
          {derivedPercent}%
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[var(--glass-bg-surface)]">
        <div
          className="h-full rounded-full bg-[var(--glass-accent-from)] transition-all"
          style={{ width: `${derivedPercent}%` }}
        />
      </div>
      {activeStep ? (
        <div className="mt-3 rounded-xl bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
          <div className="font-medium text-[var(--glass-text-primary)]">{formatSkillLabel(activeStep.skillId)}</div>
          <div className="mt-1">{activeStep.title}</div>
          <div className="mt-1">Step {activeStep.stepIndex}/{activeStep.stepTotal} · {formatScopeRef(activeStep.scopeRef)}</div>
        </div>
      ) : null}
    </div>
  )
}

function ProjectPhaseDataCard({ data }: DataMessagePartProps<ProjectPhasePartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--glass-text-primary)]">Project Phase</div>
          <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{data.phase}</div>
        </div>
        <div className="rounded-full bg-[var(--glass-bg-surface)] px-2.5 py-1 text-xs text-[var(--glass-text-secondary)]">
          Runs {String(data.snapshot.activeRunCount)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--glass-text-secondary)]">
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">Clips {String(data.snapshot.progress.clipCount)}</div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">Screenplays {String(data.snapshot.progress.screenplayClipCount)}</div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">Storyboards {String(data.snapshot.progress.storyboardCount)}</div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">Voice {String(data.snapshot.progress.voiceLineCount)}</div>
      </div>
    </div>
  )
}

export function ApprovalCard(props: {
  planId: string
  summary: string
  reasons: string[]
  onApprove: (planId: string) => Promise<void>
  onReject: (params: { planId: string; note?: string }) => Promise<void>
  approvePending: boolean
  rejectPending: boolean
}) {
  const [note, setNote] = useState('')

  return (
    <div className="rounded-2xl border border-[var(--glass-tone-warn-fg)]/30 bg-[var(--glass-bg-muted)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">Approval Required</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{props.summary}</div>
      {props.reasons.length > 0 ? (
        <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-[var(--glass-tone-warn-fg)]">
          {props.reasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      ) : null}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="拒绝说明（可选）"
        className="mt-3 min-h-20 w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl bg-[var(--glass-accent-from)] px-3 py-2 text-sm font-medium text-white"
          onClick={() => { void props.onApprove(props.planId) }}
          disabled={props.approvePending}
        >
          批准
        </button>
        <button
          type="button"
          className="flex-1 rounded-xl border border-[var(--glass-stroke-base)] px-3 py-2 text-sm font-medium text-[var(--glass-text-primary)]"
          onClick={() => { void props.onReject({ planId: props.planId, note }) }}
          disabled={props.rejectPending}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}

export function HiddenApprovalRequestDataCard(_: DataMessagePartProps<ApprovalRequestPartData>) {
  return null
}

function ConfirmationRequestDataCard({ data }: DataMessagePartProps<ConfirmationRequestPartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-tone-warn-fg)]/30 bg-[var(--glass-bg-muted)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">需要确认</div>
      <div className="mt-1">{data.summary}</div>
      <div className="mt-2 rounded-xl bg-[var(--glass-bg-surface)]/70 px-3 py-2 font-mono text-[10px] text-[var(--glass-text-tertiary)]">
        operation: {data.operationId}
      </div>
    </div>
  )
}

export function WorkflowPlanDataCard({ data }: DataMessagePartProps<WorkflowPlanPartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{data.summary || 'Workflow Plan'}</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{data.workflowId}</div>
      <div className="mt-3 space-y-2">
        {data.steps.map((step: WorkflowPlanPartData['steps'][number], stepIndex: number) => (
          <div key={`${data.planId}:step:${stepIndex}`} className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2 text-xs">
            <div className="font-medium text-[var(--glass-text-primary)]">{formatSkillLabel(step.skillId)}</div>
            <div className="mt-1 text-[var(--glass-text-secondary)]">{step.title}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface WorkflowStatusDataCardProps extends DataMessagePartProps<WorkflowStatusPartData> {
  storyToScriptStream: RunStreamView
  scriptToStoryboardStream: RunStreamView
}

function WorkflowStatusDataCard({
  data,
  storyToScriptStream,
  scriptToStoryboardStream,
}: WorkflowStatusDataCardProps) {
  return data.workflowId === 'story-to-script'
    ? (
        <WorkflowStatusCard
          title={getWorkflowDisplayLabel('story-to-script')}
          stream={storyToScriptStream}
          fallbackStatus={data.status}
        />
      )
    : (
        <WorkflowStatusCard
          title={getWorkflowDisplayLabel('script-to-storyboard')}
          stream={scriptToStoryboardStream}
          fallbackStatus={data.status}
        />
      )
}

function ProjectContextDataCard({ data }: DataMessagePartProps<ProjectContextPartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="font-medium text-[var(--glass-text-primary)]">Project Context</div>
      <div className="mt-2">Project: {data.context.projectName}</div>
      <div>Episode: {data.context.episodeName}</div>
      <div>Stage: {data.context.currentStage}</div>
    </div>
  )
}

export function ScriptPreviewDataCard({ data }: DataMessagePartProps<ScriptPreviewPartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">Screenplay Preview</div>
      <div className="mt-3 space-y-2">
        {data.clips.map((clip: ScriptPreviewPartData['clips'][number]) => (
          <div key={clip.clipId} className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2 text-xs">
            <div className="font-medium text-[var(--glass-text-primary)]">{clip.clipId}</div>
            <div className="mt-1 text-[var(--glass-text-secondary)]">{clip.summary}</div>
            <div className="mt-1 text-[var(--glass-text-tertiary)]">Scenes: {String(clip.sceneCount)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StoryboardPreviewDataCard({ data }: DataMessagePartProps<StoryboardPreviewPartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">Storyboard Preview</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">Voice Lines: {String(data.voiceLineCount)}</div>
      <div className="mt-3 space-y-2">
        {data.storyboards.map((storyboard: StoryboardPreviewPartData['storyboards'][number]) => {
          const samples = readStringArray(storyboard.sampleDescriptions)
          return (
            <div key={storyboard.storyboardId} className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2 text-xs">
              <div className="font-medium text-[var(--glass-text-primary)]">{storyboard.clipSummary}</div>
              <div className="mt-1 text-[var(--glass-text-tertiary)]">
                Clip {storyboard.clipId} · Panels {String(storyboard.panelCount)}
              </div>
              {samples.length > 0 ? (
                <div className="mt-2 space-y-1 text-[var(--glass-text-secondary)]">
                  {samples.map((sample) => (
                    <div key={sample}>{sample}</div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function WorkspaceAssistantToolCallCard(props: ToolCallMessagePartProps) {
  return (
    <Tool className="border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70">
      <ToolHeader title={`${props.toolName} (${props.status.type})`} type="dynamic-tool" state={props.result === undefined && !props.isError ? 'input-streaming' : props.isError ? 'output-error' : 'output-available'} toolName={props.toolName} />
      <ToolContent className="border-[var(--glass-stroke-base)]">
        <ToolInput input={props.args} />
        <ToolOutput output={props.result} errorText={props.isError ? JSON.stringify(props.result) : undefined} />
      </ToolContent>
    </Tool>
  )
}

interface WorkspaceAssistantMessagePartComponentsOptions {
  storyToScriptStream: RunStreamView
  scriptToStoryboardStream: RunStreamView
}

export function useWorkspaceAssistantMessagePartComponents({
  storyToScriptStream,
  scriptToStoryboardStream,
}: WorkspaceAssistantMessagePartComponentsOptions): MessagePartComponents {
  return useMemo<MessagePartComponents>(() => ({
    tools: {
      Fallback: WorkspaceAssistantToolCallCard,
    },
    data: {
      by_name: {
        'project-phase': ProjectPhaseDataCard,
        'confirmation-request': ConfirmationRequestDataCard,
        'workflow-plan': WorkflowPlanDataCard,
        'approval-request': HiddenApprovalRequestDataCard,
        'workflow-status': (props) => (
          <WorkflowStatusDataCard
            {...props}
            storyToScriptStream={storyToScriptStream}
            scriptToStoryboardStream={scriptToStoryboardStream}
          />
        ),
        'project-context': ProjectContextDataCard,
        'script-preview': ScriptPreviewDataCard,
        'storyboard-preview': StoryboardPreviewDataCard,
      },
    },
  }), [scriptToStoryboardStream, storyToScriptStream])
}

export function WorkspaceAssistantThreadMessage(props: {
  messagePartComponents: MessagePartComponents
}) {
  return (
    <>
      <MessagePrimitive.If user>
        <MessagePrimitive.Root className="ml-10 rounded-2xl bg-[var(--glass-accent-from)] px-3 py-3 text-sm text-white">
          <MessagePrimitive.Parts />
        </MessagePrimitive.Root>
      </MessagePrimitive.If>

      <MessagePrimitive.If assistant>
        <MessagePrimitive.Root className="space-y-3 rounded-2xl bg-[var(--glass-bg-muted)]/70 px-3 py-3 text-sm text-[var(--glass-text-primary)]">
          <MessagePrimitive.Parts components={props.messagePartComponents} />
        </MessagePrimitive.Root>
      </MessagePrimitive.If>

      <MessagePrimitive.If system>
        <MessagePrimitive.Root className="space-y-3 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-3 text-sm text-[var(--glass-text-primary)]">
          <MessagePrimitive.Parts components={props.messagePartComponents} />
        </MessagePrimitive.Root>
      </MessagePrimitive.If>
    </>
  )
}
