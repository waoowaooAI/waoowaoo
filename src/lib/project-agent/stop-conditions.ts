import type { StopCondition, ToolSet } from 'ai'
import type { ProjectAgentStopPartData } from './types'

export const PROJECT_AGENT_MAX_STEPS = 999

export function createProjectAgentStopController<TToolSet extends ToolSet>(_tools: TToolSet) {
  let capReached = false
  const stopWhen: StopCondition<TToolSet> = ({ steps }) => {
    if (steps.length >= PROJECT_AGENT_MAX_STEPS) {
      capReached = true
      return true
    }
    return false
  }

  const buildStopPart = (stepCount: number): ProjectAgentStopPartData | null => {
    if (!capReached) return null
    return {
      reason: 'step_cap',
      stepCount,
      maxSteps: PROJECT_AGENT_MAX_STEPS,
    }
  }

  return {
    stopWhen,
    buildStopPart,
  }
}
