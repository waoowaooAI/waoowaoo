import { SkillResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'

const skillMachine = getProjectSkillMachine('generate-screenplay')

export function GenerateScreenplaySkillRender(props: { data: unknown }) {
  return (
    <SkillResultCard
      title={skillMachine.metadata.name}
      subtitle="剧本生成 skill 的 clip 级输出"
      data={props.data}
    />
  )
}
