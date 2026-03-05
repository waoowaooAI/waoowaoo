'use client'

import { useCallback, useRef, useState } from 'react'

// =====================================================
// Types — mirror backend AgentEvent types
// =====================================================

export type AgentPhase =
  | 'planning'
  | 'analyzing'
  | 'scripting'
  | 'storyboarding'
  | 'generating_assets'
  | 'generating_video'
  | 'generating_voice'
  | 'reviewing'
  | 'revising'
  | 'completed'
  | 'failed'

export type AgentEventType =
  | 'agent_started'
  | 'agent_thinking'
  | 'agent_plan_created'
  | 'agent_step_started'
  | 'agent_step_completed'
  | 'agent_step_failed'
  | 'agent_tool_calling'
  | 'agent_tool_result'
  | 'agent_review'
  | 'agent_revision'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_final_state'
  | 'done'
  | 'error'

export interface AgentSSEEvent {
  type: AgentEventType
  runId: string
  projectId: string
  timestamp: number
  data: Record<string, unknown>
}

export interface AgentToolLogEntry {
  id: string
  name: string
  arguments?: Record<string, unknown>
  status: 'calling' | 'success' | 'failed'
  output?: Record<string, unknown>
  timestamp: number
}

export type DirectorAgentStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface DirectorAgentState {
  status: DirectorAgentStatus
  runId: string | null
  phase: AgentPhase | null
  thinkingText: string
  toolLog: AgentToolLogEntry[]
  iterationCount: number
  error: string | null
  artifacts: Record<string, unknown> | null
}

// =====================================================
// Hook
// =====================================================

export function useDirectorAgent(projectId: string, episodeId?: string) {
  const [state, setState] = useState<DirectorAgentState>({
    status: 'idle',
    runId: null,
    phase: null,
    thinkingText: '',
    toolLog: [],
    iterationCount: 0,
    error: null,
    artifacts: null,
  })

  const abortRef = useRef<AbortController | null>(null)
  const toolLogIdRef = useRef(0)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({
      status: 'idle',
      runId: null,
      phase: null,
      thinkingText: '',
      toolLog: [],
      iterationCount: 0,
      error: null,
      artifacts: null,
    })
    toolLogIdRef.current = 0
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState((prev) => ({
      ...prev,
      status: prev.status === 'running' ? 'failed' : prev.status,
      error: prev.status === 'running' ? 'Stopped by user' : prev.error,
    }))
  }, [])

  const start = useCallback(
    async (request?: string, config?: Record<string, unknown>) => {
      if (!episodeId) return

      // Reset state
      abortRef.current?.abort()
      const abortController = new AbortController()
      abortRef.current = abortController
      toolLogIdRef.current = 0

      setState({
        status: 'running',
        runId: null,
        phase: 'planning',
        thinkingText: '',
        toolLog: [],
        iterationCount: 0,
        error: null,
        artifacts: null,
      })

      try {
        const response = await fetch(
          `/api/novel-promotion/${projectId}/agent-run`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              episodeId,
              request: request || '',
              config,
            }),
            signal: abortController.signal,
          },
        )

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error')
          setState((prev) => ({
            ...prev,
            status: 'failed',
            error: `API error ${response.status}: ${errText}`,
          }))
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          setState((prev) => ({ ...prev, status: 'failed', error: 'No stream body' }))
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            let event: AgentSSEEvent
            try {
              event = JSON.parse(jsonStr)
            } catch {
              continue
            }

            handleEvent(event)
          }
        }

        // Process remaining buffer
        if (buffer.startsWith('data: ')) {
          const jsonStr = buffer.slice(6).trim()
          if (jsonStr) {
            try {
              const event: AgentSSEEvent = JSON.parse(jsonStr)
              handleEvent(event)
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        }))
      }

      function handleEvent(event: AgentSSEEvent) {
        switch (event.type) {
          case 'agent_started':
            setState((prev) => ({
              ...prev,
              status: 'running',
              runId: event.runId,
            }))
            break

          case 'agent_thinking':
            setState((prev) => ({
              ...prev,
              thinkingText:
                prev.thinkingText +
                (typeof event.data.thinking === 'string' ? event.data.thinking : ''),
              iterationCount:
                typeof event.data.iteration === 'number'
                  ? event.data.iteration
                  : prev.iterationCount,
            }))
            break

          case 'agent_tool_calling': {
            const toolId = `tool-${++toolLogIdRef.current}`
            const entry: AgentToolLogEntry = {
              id: toolId,
              name: String(event.data.toolName || ''),
              arguments: event.data.arguments as Record<string, unknown> | undefined,
              status: 'calling',
              timestamp: event.timestamp,
            }
            setState((prev) => ({
              ...prev,
              toolLog: [...prev.toolLog, entry],
            }))
            break
          }

          case 'agent_tool_result': {
            const toolName = String(event.data.toolName || '')
            const success = event.data.success === true
            setState((prev) => {
              const log = [...prev.toolLog]
              // Find the last matching tool_calling entry
              for (let i = log.length - 1; i >= 0; i--) {
                if (log[i].name === toolName && log[i].status === 'calling') {
                  log[i] = {
                    ...log[i],
                    status: success ? 'success' : 'failed',
                    output: event.data.output as Record<string, unknown> | undefined,
                  }
                  break
                }
              }
              return { ...prev, toolLog: log }
            })
            break
          }

          case 'agent_completed':
            setState((prev) => ({
              ...prev,
              status: 'completed',
              phase: 'completed',
              artifacts: (event.data.artifacts as Record<string, unknown>) || prev.artifacts,
            }))
            break

          case 'agent_failed':
            setState((prev) => ({
              ...prev,
              status: 'failed',
              phase: 'failed',
              error: String(event.data.reason || event.data.error || 'Agent failed'),
            }))
            break

          case 'agent_final_state':
            setState((prev) => ({
              ...prev,
              phase: (event.data.phase as AgentPhase) || prev.phase,
              iterationCount:
                typeof event.data.iterationCount === 'number'
                  ? event.data.iterationCount
                  : prev.iterationCount,
              artifacts: (event.data.artifacts as Record<string, unknown>) || prev.artifacts,
            }))
            break

          case 'error':
            setState((prev) => ({
              ...prev,
              status: 'failed',
              error: String(event.data.error || 'Unknown error'),
            }))
            break

          case 'done':
            setState((prev) => ({
              ...prev,
              status: prev.status === 'running' ? 'completed' : prev.status,
            }))
            break
        }
      }
    },
    [projectId, episodeId],
  )

  return {
    ...state,
    isRunning: state.status === 'running',
    isVisible: state.status !== 'idle',
    start,
    stop,
    reset,
  }
}
