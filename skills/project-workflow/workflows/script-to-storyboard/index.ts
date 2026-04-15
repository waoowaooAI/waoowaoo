import type { WorkflowPackage } from '@/lib/skill-system/types'
import { getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'
import {
  scriptToStoryboardWorkflowInputSchema,
  scriptToStoryboardWorkflowManifest,
  scriptToStoryboardWorkflowOutputSchema,
} from './manifest'
import { runScriptToStoryboardWorkflowPackage } from './execute'
import { ScriptToStoryboardWorkflowRender } from './render'

const workflowMachine = getProjectWorkflowMachine('script-to-storyboard')

const scriptToStoryboardWorkflowPackage: WorkflowPackage = {
  kind: 'workflow',
  manifest: scriptToStoryboardWorkflowManifest,
  documentPath: workflowMachine.documentPath,
  inputSchema: scriptToStoryboardWorkflowInputSchema,
  outputSchema: scriptToStoryboardWorkflowOutputSchema,
  steps: workflowMachine.steps,
  execute: async (input) => await runScriptToStoryboardWorkflowPackage(input as Parameters<typeof runScriptToStoryboardWorkflowPackage>[0]),
  render: ScriptToStoryboardWorkflowRender,
}

export default scriptToStoryboardWorkflowPackage
