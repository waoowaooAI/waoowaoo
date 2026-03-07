import { describe, expect, it } from 'vitest'
import { getTaskFlowMeta, getTaskPipeline } from '@/lib/llm-observe/stage-pipeline'
import { getLLMTaskPolicy } from '@/lib/llm-observe/task-policy'
import { TASK_TYPE } from '@/lib/task/types'

describe('llm observe task contract', () => {
  it('maps AI_CREATE tasks to standard llm policy', () => {
    const characterPolicy = getLLMTaskPolicy(TASK_TYPE.AI_CREATE_CHARACTER)
    const locationPolicy = getLLMTaskPolicy(TASK_TYPE.AI_CREATE_LOCATION)

    expect(characterPolicy.consoleEnabled).toBe(true)
    expect(characterPolicy.displayMode).toBe('loading')
    expect(characterPolicy.captureReasoning).toBe(true)

    expect(locationPolicy.consoleEnabled).toBe(true)
    expect(locationPolicy.displayMode).toBe('loading')
    expect(locationPolicy.captureReasoning).toBe(true)
  })

  it('maps story/script run tasks to long-flow stage metadata', () => {
    const storyMeta = getTaskFlowMeta(TASK_TYPE.STORY_TO_SCRIPT_RUN)
    const scriptMeta = getTaskFlowMeta(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)

    expect(storyMeta.flowId).toBe('novel_promotion_generation')
    expect(storyMeta.flowStageIndex).toBe(1)
    expect(storyMeta.flowStageTotal).toBe(2)

    expect(scriptMeta.flowId).toBe('novel_promotion_generation')
    expect(scriptMeta.flowStageIndex).toBe(2)
    expect(scriptMeta.flowStageTotal).toBe(2)
  })

  it('maps AI_CREATE tasks to dedicated single-stage flows', () => {
    const characterMeta = getTaskFlowMeta(TASK_TYPE.AI_CREATE_CHARACTER)
    const locationMeta = getTaskFlowMeta(TASK_TYPE.AI_CREATE_LOCATION)

    expect(characterMeta.flowId).toBe('novel_promotion_ai_create_character')
    expect(characterMeta.flowStageIndex).toBe(1)
    expect(characterMeta.flowStageTotal).toBe(1)

    expect(locationMeta.flowId).toBe('novel_promotion_ai_create_location')
    expect(locationMeta.flowStageIndex).toBe(1)
    expect(locationMeta.flowStageTotal).toBe(1)
  })

  it('returns a stable two-stage pipeline for story/script flow', () => {
    const pipeline = getTaskPipeline(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)
    const stageTaskTypes = pipeline.stages.map((stage) => stage.taskType)
    expect(stageTaskTypes).toEqual([
      TASK_TYPE.STORY_TO_SCRIPT_RUN,
      TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
    ])
  })

  it('falls back to single-stage metadata for unknown task type', () => {
    const meta = getTaskFlowMeta('unknown_task_type')
    const pipeline = getTaskPipeline('unknown_task_type')

    expect(meta.flowId).toBe('single:unknown_task_type')
    expect(meta.flowStageIndex).toBe(1)
    expect(meta.flowStageTotal).toBe(1)
    expect(pipeline.stages).toHaveLength(1)
    expect(pipeline.stages[0]?.taskType).toBe('unknown_task_type')
  })
})
