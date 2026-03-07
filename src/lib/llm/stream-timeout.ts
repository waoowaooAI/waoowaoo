/**
 * Per-chunk timeout wrapper for async iterables.
 *
 * Wraps an `AsyncIterable` so that if no chunk arrives within
 * `perChunkTimeoutMs`, a timeout error is thrown.  The timer resets
 * after every received chunk, so long-running but *active* streams
 * are never interrupted.
 *
 * Default timeout: 3 minutes (180 000 ms).
 */

const DEFAULT_STREAM_CHUNK_TIMEOUT_MS = 3 * 60 * 1000

export class StreamChunkTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`LLM_STREAM_TIMEOUT: No stream chunk received within ${Math.round(timeoutMs / 1000)}s`)
        this.name = 'StreamChunkTimeoutError'
    }
}

export async function* withStreamChunkTimeout<T>(
    source: AsyncIterable<T>,
    timeoutMs: number = DEFAULT_STREAM_CHUNK_TIMEOUT_MS,
): AsyncGenerator<T> {
    const iterator = source[Symbol.asyncIterator]()
    while (true) {
        const result = await Promise.race([
            iterator.next(),
            new Promise<never>((_, reject) => {
                const timer = setTimeout(
                    () => reject(new StreamChunkTimeoutError(timeoutMs)),
                    timeoutMs,
                )
                // Prevent the timer from keeping Node alive if the iterator
                // completes before the timeout fires.
                if (typeof timer === 'object' && 'unref' in timer) {
                    timer.unref()
                }
            }),
        ])
        if (result.done) return
        yield result.value
    }
}
