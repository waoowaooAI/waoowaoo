import { TASK_TYPE, type TaskType } from '@/lib/task/types'

const AI_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(Object.values(TASK_TYPE))

export function isAiTaskType(type: TaskType): boolean {
  return AI_TASK_TYPES.has(type)
}

export function workflowTypeFromTaskType(type: TaskType): string {
  return type
}

