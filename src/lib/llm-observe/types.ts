import type { LLMObserveDisplayMode } from './config'

export type LLMStreamKind = 'text' | 'reasoning'

export type LLMStreamChunk = {
  kind: LLMStreamKind
  delta: string
  seq: number
  lane?: string | null
}

export type LLMObserveMeta = {
  route?: string | null
  provider?: string | null
  episodeId?: string | null
  clipId?: string | null
}

export type LLMObservePayload = {
  displayMode?: LLMObserveDisplayMode
  message?: string
  stage?: string
  stageLabel?: string
  flowId?: string
  flowStageIndex?: number
  flowStageTotal?: number
  flowStageTitle?: string
  streamRunId?: string
  progress?: number
  stream?: LLMStreamChunk
  meta?: LLMObserveMeta
  done?: boolean
  [key: string]: unknown
}
