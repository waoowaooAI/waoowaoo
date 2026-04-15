import { WorkflowResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'

const workflowMachine = getProjectWorkflowMachine('script-to-storyboard')

export function ScriptToStoryboardWorkflowRender(props: { data: unknown }) {
  return (
    <WorkflowResultCard
      title={`${workflowMachine.manifest.name} Workflow`}
      summary="固定串行 workflow package：先规划分镜，再细化，再生成台词"
      skills={workflowMachine.steps.map((step) => step.skillId)}
      data={props.data}
    />
  )
}
