import { SkillResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'

const skillMachine = getProjectSkillMachine('refine-acting')

export function RefineActingSkillRender(props: { data: unknown }) {
  return (
    <SkillResultCard
      title={skillMachine.metadata.name}
      subtitle="表演指导 skill 的结构化输出"
      data={props.data}
    />
  )
}
