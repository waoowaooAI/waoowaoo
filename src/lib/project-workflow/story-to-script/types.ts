import type {
  RunStepStatus,
  RunStreamEvent,
  RunStreamEventType,
  RunStreamLane,
  RunStreamStatus,
} from '@/lib/project-workflow/run-stream/types'

export type StoryToScriptLane = RunStreamLane
export type StoryToScriptRunEventType = RunStreamEventType
export type StoryToScriptRunStatus = RunStreamStatus
export type StoryToScriptStepStatus = RunStepStatus
export type StoryToScriptStreamEvent = RunStreamEvent
