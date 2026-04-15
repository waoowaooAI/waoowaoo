import { SkillResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'

const skillMachine = getProjectSkillMachine('refine-storyboard-detail')

export function RefineStoryboardDetailSkillRender(props: { data: unknown }) {
  return (
    <SkillResultCard
      title={skillMachine.metadata.name}
      subtitle="镜头细化 skill 的最终 panel 输出"
      data={props.data}
    />
  )
}
