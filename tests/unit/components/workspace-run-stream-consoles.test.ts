import * as React from 'react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkspaceRunStreamConsoles from '@/features/project-workspace/components/WorkspaceRunStreamConsoles'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/llm-console/LLMStageStreamCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => createElement('section', null, `LLMStageStreamCard:${title}`),
}))

function createStreamState(overrides?: Partial<React.ComponentProps<typeof WorkspaceRunStreamConsoles>['storyToScriptStream']>) {
  return {
    status: 'running' as const,
    isVisible: true,
    isRecoveredRunning: true,
    stages: [],
    selectedStep: null,
    activeStepId: null,
    outputText: '',
    activeMessage: '',
    overallProgress: 0,
    isRunning: false,
    errorMessage: '',
    stop: () => undefined,
    reset: () => undefined,
    selectStep: () => undefined,
    retryStep: async () => ({
      runId: 'run-1',
      status: 'running',
      summary: null,
      payload: null,
      errorMessage: '',
    }),
    ...overrides,
  }
}

describe('WorkspaceRunStreamConsoles', () => {
  it('shows fallback running console when a recovered run has no stages yet', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(WorkspaceRunStreamConsoles, {
        storyToScriptStream: createStreamState(),
        scriptToStoryboardStream: createStreamState({
          status: 'idle',
          isVisible: false,
          isRecoveredRunning: false,
        }),
        storyToScriptConsoleMinimized: false,
        scriptToStoryboardConsoleMinimized: true,
        onStoryToScriptMinimizedChange: () => undefined,
        onScriptToStoryboardMinimizedChange: () => undefined,
      }),
    )

    expect(html).toContain('LLMStageStreamCard:runConsole.storyToScript')
  })
})
