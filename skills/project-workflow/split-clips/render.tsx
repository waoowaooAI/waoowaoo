import { SkillResultCard } from '@skills/project-workflow/_shared/render'
import { getProjectSkillMachine } from '@/lib/skill-system/project-workflow-machine'

const skillMachine = getProjectSkillMachine('split-clips')

export function SplitClipsSkillRender(props: { data: unknown }) {
  return (
    <SkillResultCard
      title={skillMachine.metadata.name}
      subtitle="片段切分 skill 的边界和 clip 输出"
      data={props.data}
    />
  )
}
