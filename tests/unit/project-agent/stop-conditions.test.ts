import { describe, expect, it } from 'vitest'
import type { StepResult, ToolSet } from 'ai'
import { createProjectAgentStopController, PROJECT_AGENT_MAX_STEPS } from '@/lib/project-agent/stop-conditions'

function buildSteps(count: number): StepResult<ToolSet>[] {
  const step = {} as StepResult<ToolSet>
  return Array.from({ length: count }, () => step)
}

describe('project agent stop conditions', () => {
  it('[below cap] -> stopWhen false and no stop part', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = buildSteps(PROJECT_AGENT_MAX_STEPS - 1)

    expect(controller.stopWhen({ steps })).toBe(false)
    expect(controller.buildStopPart(steps.length)).toBeNull()
  })

  it('[cap reached] -> stopWhen true and stop part returned', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = buildSteps(PROJECT_AGENT_MAX_STEPS)

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'step_cap',
      stepCount: PROJECT_AGENT_MAX_STEPS,
      maxSteps: PROJECT_AGENT_MAX_STEPS,
    })
  })
})
