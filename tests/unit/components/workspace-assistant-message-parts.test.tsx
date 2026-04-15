import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ApprovalCard,
  ScriptPreviewDataCard,
  StoryboardPreviewDataCard,
  WorkflowPlanDataCard,
  WorkflowStatusCard,
  WorkspaceAssistantToolCallCard,
} from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers'
import type { RunStreamView } from '@/lib/query/hooks/run-stream/types'

function buildRunStreamView(): RunStreamView {
  return {
    runState: null,
    runId: 'run-1',
    status: 'running',
    isRunning: true,
    isRecoveredRunning: false,
    isVisible: true,
    activeStepId: 'step-1',
    activeMessage: 'running',
    overallProgress: 42,
    errorMessage: '',
    summary: null,
    payload: null,
    stages: [],
    orderedSteps: [
      {
        id: 'step-1',
        attempt: 1,
        title: 'Analyze Characters',
        status: 'running',
        message: 'running',
        skillId: 'analyze-characters',
        scopeRef: 'episode:episode-1',
        stepIndex: 1,
        stepTotal: 5,
        dependsOn: [],
        blockedBy: [],
        groupId: null,
        parallelKey: null,
        retryable: false,
        textOutput: '',
        reasoningOutput: '',
        textLength: 0,
        reasoningLength: 0,
        errorMessage: '',
        updatedAt: 0,
        seqByLane: {
          text: 0,
          reasoning: 0,
        },
      },
    ],
    selectedStep: null,
    outputText: '',
    run: vi.fn(),
    retryStep: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    selectStep: vi.fn(),
  }
}

describe('workspace assistant renderers', () => {
  it('renders workflow, approval, status, and preview cards', () => {
    const html = renderToStaticMarkup(
      <>
        <WorkflowPlanDataCard
          data={{
            workflowId: 'story-to-script',
            commandId: 'command-1',
            planId: 'plan-1',
            summary: 'Story To Script',
            requiresApproval: true,
            steps: [
              { skillId: 'analyze-characters', title: 'Analyze Characters' },
              { skillId: 'generate-screenplay', title: 'Generate Screenplay' },
            ],
          }}
          type="data"
          name="workflow-plan"
          status={{ type: 'complete' }}
        />
        <ApprovalCard
          planId="plan-1"
          summary="Needs approval"
          reasons={['story-to-script invalidates clip.screenplay']}
          onApprove={async () => undefined}
          onReject={async () => undefined}
          approvePending={false}
          rejectPending={false}
        />
        <WorkflowStatusCard
          title="Story To Script"
          stream={buildRunStreamView()}
          fallbackStatus="running"
        />
        <ScriptPreviewDataCard
          data={{
            workflowId: 'story-to-script',
            episodeId: 'episode-1',
            clips: [
              { clipId: 'clip-1', summary: '片段摘要', sceneCount: 2 },
            ],
          }}
          type="data"
          name="script-preview"
          status={{ type: 'complete' }}
        />
        <StoryboardPreviewDataCard
          data={{
            workflowId: 'script-to-storyboard',
            episodeId: 'episode-1',
            storyboards: [
              {
                storyboardId: 'storyboard-1',
                clipId: 'clip-1',
                clipSummary: '镜头摘要',
                panelCount: 3,
                sampleDescriptions: ['示例一'],
              },
            ],
            voiceLineCount: 1,
          }}
          type="data"
          name="storyboard-preview"
          status={{ type: 'complete' }}
        />
      </>,
    )

    expect(html).toContain('Story To Script')
    expect(html).toContain('角色分析')
    expect(html).toContain('Approval Required')
    expect(html).toContain('Screenplay Preview')
    expect(html).toContain('Storyboard Preview')
    expect(html).toContain('片段摘要')
    expect(html).toContain('镜头摘要')
  })

  it('renders tool cards collapsed by default', () => {
    const html = renderToStaticMarkup(
      <WorkspaceAssistantToolCallCard
        type="tool-call"
        toolCallId="tool-1"
        toolName="get_project_context"
        args={{}}
        argsText="{}"
        result={{ projectName: 'test' }}
        status={{ type: 'complete' }}
        addResult={() => undefined}
        resume={() => undefined}
      />,
    )

    expect(html).toContain('get_project_context (complete)')
    expect(html).not.toContain('Parameters')
    expect(html).not.toContain('projectName')
  })
})
