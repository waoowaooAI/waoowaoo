import { runScriptToStoryboardWorkflowPackage } from '@skills/project-workflow/workflows/script-to-storyboard/execute'
import type {
  ScriptToStoryboardWorkflowInput,
  ScriptToStoryboardWorkflowResult,
} from './types'

export async function runScriptToStoryboardSkillWorkflow(
  input: ScriptToStoryboardWorkflowInput,
): Promise<ScriptToStoryboardWorkflowResult> {
  return await runScriptToStoryboardWorkflowPackage(input)
}
