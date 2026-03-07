import { describe, expect, it, vi } from 'vitest'
import { executeRunRequest } from '@/lib/query/hooks/run-stream/run-request-executor'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

describe('run-request-executor run events path', () => {
  it('uses /api/runs/:runId/events when async response includes runId', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        async: true,
        taskId: 'task_1',
        runId: 'run_1',
      }))
      .mockResolvedValueOnce(jsonResponse({
        runId: 'run_1',
        afterSeq: 0,
        events: [
          {
            seq: 1,
            eventType: 'run.start',
            payload: { message: 'started' },
            createdAt: '2026-02-28T00:00:00.000Z',
          },
          {
            seq: 2,
            eventType: 'step.start',
            stepKey: 'step_a',
            attempt: 1,
            payload: {
              stepTitle: 'Step A',
              stepIndex: 1,
              stepTotal: 1,
            },
            createdAt: '2026-02-28T00:00:01.000Z',
          },
          {
            seq: 3,
            eventType: 'step.chunk',
            stepKey: 'step_a',
            attempt: 1,
            lane: 'text',
            payload: {
              stream: {
                delta: 'hello',
                seq: 1,
              },
            },
            createdAt: '2026-02-28T00:00:01.100Z',
          },
          {
            seq: 4,
            eventType: 'step.complete',
            stepKey: 'step_a',
            attempt: 1,
            payload: {
              text: 'hello',
            },
            createdAt: '2026-02-28T00:00:02.000Z',
          },
          {
            seq: 5,
            eventType: 'run.complete',
            payload: {
              summary: { ok: true },
            },
            createdAt: '2026-02-28T00:00:03.000Z',
          },
        ],
      }))

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock

    try {
      const captured: RunStreamEvent[] = []
      const controller = new AbortController()
      const result = await executeRunRequest({
        endpointUrl: '/api/novel-promotion/project_1/story-to-script-stream',
        requestBody: { episodeId: 'episode_1' },
        controller,
        taskStreamTimeoutMs: 30_000,
        applyAndCapture: (event) => {
          captured.push(event)
        },
        finalResultRef: { current: null },
      })

      expect(result.status).toBe('completed')
      expect(result.runId).toBe('run_1')
      expect(captured.some((event) => event.event === 'step.chunk' && event.textDelta === 'hello')).toBe(true)
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/runs/run_1/events?afterSeq=0&limit=500')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('surfaces run-events fetch errors instead of swallowing them', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        async: true,
        taskId: 'task_1',
        runId: 'run_1',
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: 'events backend unavailable',
        },
      }, 503))

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock

    try {
      const controller = new AbortController()
      await expect(executeRunRequest({
        endpointUrl: '/api/novel-promotion/project_1/story-to-script-stream',
        requestBody: { episodeId: 'episode_1' },
        controller,
        taskStreamTimeoutMs: 30_000,
        applyAndCapture: () => undefined,
        finalResultRef: { current: null },
      })).rejects.toThrow('run events fetch failed (HTTP 503): events backend unavailable')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('uses idle timeout and resets the timer when new events arrive', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>()
    let eventsRequestCount = 0
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/story-to-script-stream')) {
        return jsonResponse({
          success: true,
          async: true,
          taskId: 'task_1',
          runId: 'run_1',
        })
      }

      if (url === '/api/runs/run_1') {
        return jsonResponse({
          run: {
            id: 'run_1',
            status: 'running',
          },
        })
      }

      if (!url.includes('/api/runs/run_1/events')) {
        return jsonResponse({ events: [] })
      }

      eventsRequestCount += 1
      if (eventsRequestCount === 3) {
        return jsonResponse({
          events: [
            {
              seq: 1,
              eventType: 'run.start',
              payload: { message: 'started' },
              createdAt: '2026-02-28T00:00:03.000Z',
            },
          ],
        })
      }

      return jsonResponse({ events: [] })
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock

    try {
      const controller = new AbortController()
      let settled = false
      const request = executeRunRequest({
        endpointUrl: '/api/novel-promotion/project_1/story-to-script-stream',
        requestBody: { episodeId: 'episode_1' },
        controller,
        taskStreamTimeoutMs: 3_000,
        applyAndCapture: () => undefined,
        finalResultRef: { current: null },
      }).finally(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(5_000)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(3_000)
      await expect(request).resolves.toEqual(expect.objectContaining({
        runId: 'run_1',
        status: 'failed',
        errorMessage: 'run stream timeout: run_1',
      }))
    } finally {
      vi.useRealTimers()
      globalThis.fetch = originalFetch
    }
  })

  it('reconciles terminal failed run status when events stream has no new rows', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/story-to-script-stream')) {
        return jsonResponse({
          success: true,
          async: true,
          taskId: 'task_2',
          runId: 'run_2',
        })
      }
      if (url.includes('/api/runs/run_2/events')) {
        return jsonResponse({ events: [] })
      }
      if (url === '/api/runs/run_2') {
        return jsonResponse({
          run: {
            id: 'run_2',
            status: 'failed',
            errorMessage: 'Ark Responses 调用失败',
          },
        })
      }
      return jsonResponse({ events: [] })
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock

    try {
      const captured: RunStreamEvent[] = []
      const controller = new AbortController()
      const request = executeRunRequest({
        endpointUrl: '/api/novel-promotion/project_1/story-to-script-stream',
        requestBody: { episodeId: 'episode_1' },
        controller,
        taskStreamTimeoutMs: 30_000,
        applyAndCapture: (event) => {
          captured.push(event)
        },
        finalResultRef: { current: null },
      })

      await vi.advanceTimersByTimeAsync(3_500)
      await expect(request).resolves.toEqual(expect.objectContaining({
        runId: 'run_2',
        status: 'failed',
        errorMessage: 'Ark Responses 调用失败',
      }))
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/runs/run_2',
        expect.objectContaining({ method: 'GET', cache: 'no-store' }),
      )
      expect(captured.some((event) => event.event === 'run.error' && event.message === 'Ark Responses 调用失败')).toBe(true)
    } finally {
      vi.useRealTimers()
      globalThis.fetch = originalFetch
    }
  })
})
