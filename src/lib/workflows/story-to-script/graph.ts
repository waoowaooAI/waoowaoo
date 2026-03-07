import { runPipelineGraph, type PipelineGraphState } from '@/lib/run-runtime/pipeline-graph'
import {
  runStoryToScriptOrchestrator,
  type StoryToScriptOrchestratorResult,
  type StoryToScriptPromptTemplates,
  type StoryToScriptStepMeta,
  type StoryToScriptStepOutput,
} from '@/lib/novel-promotion/story-to-script/orchestrator'

export type StoryToScriptGraphState = PipelineGraphState & {
  orchestratorResult: StoryToScriptOrchestratorResult | null
}

export type StoryToScriptGraphInput = {
  runId: string
  projectId: string
  userId: string
  concurrency: number
  content: string
  baseCharacters: string[]
  baseLocations: string[]
  baseCharacterIntroductions: Array<{ name: string; introduction?: string | null }>
  promptTemplates: StoryToScriptPromptTemplates
  runStep: (
    meta: StoryToScriptStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number,
  ) => Promise<StoryToScriptStepOutput>
}

export async function runStoryToScriptGraph(
  input: StoryToScriptGraphInput,
): Promise<StoryToScriptGraphState> {
  const initialState: StoryToScriptGraphState = {
    refs: {},
    meta: {},
    orchestratorResult: null,
  }

  return await runPipelineGraph({
    runId: input.runId,
    projectId: input.projectId,
    userId: input.userId,
    state: initialState,
    nodes: [
      {
        key: 'story_to_script_orchestrator',
        title: 'story_to_script_orchestrator',
        maxAttempts: 2,
        timeoutMs: 1000 * 60 * 15,
        run: async (context) => {
          const orchestratorResult = await runStoryToScriptOrchestrator({
            content: input.content,
            concurrency: input.concurrency,
            baseCharacters: input.baseCharacters,
            baseLocations: input.baseLocations,
            baseCharacterIntroductions: input.baseCharacterIntroductions,
            promptTemplates: input.promptTemplates,
            runStep: input.runStep,
          })

          context.state.orchestratorResult = orchestratorResult
          return {
            output: {
              clipCount: orchestratorResult.summary.clipCount,
              screenplaySuccessCount: orchestratorResult.summary.screenplaySuccessCount,
              screenplayFailedCount: orchestratorResult.summary.screenplayFailedCount,
            },
          }
        },
      },
      {
        key: 'story_to_script_validate',
        title: 'story_to_script_validate',
        maxAttempts: 1,
        timeoutMs: 1000 * 30,
        run: async (context) => {
          const result = context.state.orchestratorResult
          if (!result) {
            throw new Error('story_to_script orchestrator produced no result')
          }
          if (result.summary.screenplayFailedCount > 0) {
            const failed = result.screenplayResults.filter((item) => !item.success)
            const preview = failed
              .slice(0, 3)
              .map((item) => `${item.clipId}:${item.error || 'unknown error'}`)
              .join(' | ')
            throw new Error(
              `STORY_TO_SCRIPT_PARTIAL_FAILED: ${result.summary.screenplayFailedCount}/${result.summary.clipCount} screenplay steps failed. ${preview}`,
            )
          }
          return {
            output: {
              validated: true,
              clipCount: result.summary.clipCount,
            },
          }
        },
      },
    ],
  })
}
