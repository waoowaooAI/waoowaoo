import { WorkflowResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'

const workflowMachine = getProjectWorkflowMachine('story-to-script')

export function StoryToScriptWorkflowRender(props: { data: unknown }) {
  return (
    <WorkflowResultCard
      title={`${workflowMachine.manifest.name} Workflow`}
      summary="固定串行 workflow package：先分析，再切片，再生成剧本"
      skills={workflowMachine.steps.map((step) => step.skillId)}
      data={props.data}
    />
  )
}
