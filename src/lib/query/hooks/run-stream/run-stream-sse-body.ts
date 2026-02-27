import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { parseSSEBlock } from './event-parser'

function toStreamEvent(data: Record<string, unknown>, parsedEvent: string): RunStreamEvent {
  return {
    runId: typeof data.runId === 'string' ? data.runId : '',
    event: parsedEvent as RunStreamEvent['event'],
    ts: typeof data.ts === 'string' ? data.ts : new Date().toISOString(),
    status: (data.status as RunStreamEvent['status']) || undefined,
    stepId: typeof data.stepId === 'string' ? data.stepId : undefined,
    stepTitle: typeof data.stepTitle === 'string' ? data.stepTitle : undefined,
    stepIndex: typeof data.stepIndex === 'number' ? data.stepIndex : undefined,
    stepTotal: typeof data.stepTotal === 'number' ? data.stepTotal : undefined,
    lane: data.lane === 'reasoning' ? 'reasoning' : data.lane === 'text' ? 'text' : undefined,
    seq: typeof data.seq === 'number' ? data.seq : undefined,
    textDelta: typeof data.textDelta === 'string' ? data.textDelta : undefined,
    reasoningDelta: typeof data.reasoningDelta === 'string' ? data.reasoningDelta : undefined,
    text: typeof data.text === 'string' ? data.text : undefined,
    reasoning: typeof data.reasoning === 'string' ? data.reasoning : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
    payload: (() => {
      const payload =
        typeof data.payload === 'object' && data.payload ? (data.payload as Record<string, unknown>) : null
      const summary =
        typeof data.summary === 'object' && data.summary ? (data.summary as Record<string, unknown>) : null
      if (!summary) return payload
      return {
        ...(payload || {}),
        summary,
      }
    })(),
  }
}

export async function streamSSEBody(args: {
  responseBody: ReadableStream<Uint8Array>
  applyAndCapture: (streamEvent: RunStreamEvent) => void
}) {
  const reader = args.responseBody.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const idx = buffer.indexOf('\n\n')
      if (idx === -1) break
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)

      const parsed = parseSSEBlock(block)
      if (!parsed) continue

      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(parsed.data) as Record<string, unknown>
      } catch {
        continue
      }

      args.applyAndCapture(toStreamEvent(data, parsed.event))
    }
  }
}
