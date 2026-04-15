import type { WorkflowPackage } from '@/lib/skill-system/types'
import { getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'
import { storyToScriptWorkflowManifest, storyToScriptWorkflowInputSchema, storyToScriptWorkflowOutputSchema } from './manifest'
import { runStoryToScriptWorkflowPackage } from './execute'
import { StoryToScriptWorkflowRender } from './render'

const workflowMachine = getProjectWorkflowMachine('story-to-script')

const storyToScriptWorkflowPackage: WorkflowPackage = {
  kind: 'workflow',
  manifest: storyToScriptWorkflowManifest,
  documentPath: workflowMachine.documentPath,
  inputSchema: storyToScriptWorkflowInputSchema,
  outputSchema: storyToScriptWorkflowOutputSchema,
  steps: workflowMachine.steps,
  execute: async (input) => await runStoryToScriptWorkflowPackage(input as Parameters<typeof runStoryToScriptWorkflowPackage>[0]),
  render: StoryToScriptWorkflowRender,
}

export default storyToScriptWorkflowPackage
