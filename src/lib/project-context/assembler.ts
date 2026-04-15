import { assembleProjectWorkflowContext } from '@/lib/context/project-workflow-context'
import type { ProjectContextSnapshot } from './types'

export async function assembleProjectContext(params: {
  projectId: string
  userId: string
  episodeId?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
}): Promise<ProjectContextSnapshot> {
  return await assembleProjectWorkflowContext(params)
}
