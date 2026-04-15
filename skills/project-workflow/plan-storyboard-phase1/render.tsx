import { SkillResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'

const skillMachine = getProjectSkillMachine('plan-storyboard-phase1')

export function PlanStoryboardPhase1SkillRender(props: { data: unknown }) {
  return (
    <SkillResultCard
      title={skillMachine.metadata.name}
      subtitle="分镜一期规划 skill 的 panel 输出"
      data={props.data}
    />
  )
}
