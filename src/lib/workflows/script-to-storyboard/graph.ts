import { runPipelineGraph, type PipelineGraphState } from '@/lib/run-runtime/pipeline-graph'
import {
  runScriptToStoryboardOrchestrator,
  type ScriptToStoryboardOrchestratorResult,
  type ScriptToStoryboardPromptTemplates,
  type ScriptToStoryboardStepMeta,
  type ScriptToStoryboardStepOutput,
  JsonParseError,
} from '@/lib/novel-promotion/script-to-storyboard/orchestrator'
import type { CharacterAsset, LocationAsset } from '@/lib/storyboard-phases'

type ClipInput = {
  id: string
  content: string | null
  characters: string | null
  location: string | null
  screenplay: string | null
}

type NovelPromotionData = {
  characters: CharacterAsset[]
  locations: LocationAsset[]
}

export type ScriptToStoryboardGraphState = PipelineGraphState & {
  orchestratorResult: ScriptToStoryboardOrchestratorResult | null
}

export type ScriptToStoryboardGraphInput = {
  runId: string
  projectId: string
  userId: string
  concurrency: number
  clips: ClipInput[]
  novelPromotionData: NovelPromotionData
  promptTemplates: ScriptToStoryboardPromptTemplates
  runStep: (
    meta: ScriptToStoryboardStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number,
  ) => Promise<ScriptToStoryboardStepOutput>
  onParseError?: (error: JsonParseError) => Promise<void> | void
}

export async function runScriptToStoryboardGraph(
  input: ScriptToStoryboardGraphInput,
): Promise<ScriptToStoryboardGraphState> {
  const initialState: ScriptToStoryboardGraphState = {
    refs: {},
    meta: {},
    orchestratorResult: null,
  }

  try {
    return await runPipelineGraph({
      runId: input.runId,
      projectId: input.projectId,
      userId: input.userId,
      state: initialState,
      nodes: [
        {
          key: 'script_to_storyboard_orchestrator',
          title: 'script_to_storyboard_orchestrator',
          maxAttempts: 2,
          timeoutMs: 1000 * 60 * 20,
          run: async (context) => {
            const nextResult = await runScriptToStoryboardOrchestrator({
              concurrency: input.concurrency,
              clips: input.clips,
              novelPromotionData: input.novelPromotionData,
              promptTemplates: input.promptTemplates,
              runStep: input.runStep,
            })

            context.state.orchestratorResult = nextResult
            return {
              output: {
                clipCount: nextResult.summary.clipCount,
                totalPanelCount: nextResult.summary.totalPanelCount,
              },
            }
          },
        },
        {
          key: 'script_to_storyboard_validate',
          title: 'script_to_storyboard_validate',
          maxAttempts: 1,
          timeoutMs: 1000 * 30,
          run: async (context) => {
            if (!context.state.orchestratorResult) {
              throw new Error('script_to_storyboard orchestrator produced no result')
            }
            return {
              output: {
                validated: true,
                totalPanelCount: context.state.orchestratorResult.summary.totalPanelCount,
              },
            }
          },
        },
      ],
    })
  } catch (error) {
    if (error instanceof JsonParseError) {
      await input.onParseError?.(error)
    }
    throw error
  }
}
