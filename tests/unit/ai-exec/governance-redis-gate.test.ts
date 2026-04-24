import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/redis', () => {
  return {
    queueRedis: {
      eval: vi.fn(),
      pexpire: vi.fn(async () => 1),
    },
  }
})

describe('ai-exec/governance - redis concurrency gate', () => {
  const originalMode = process.env.AI_CONCURRENCY_GATE_MODE
  const originalTtl = process.env.AI_CONCURRENCY_GATE_TTL_MS

  beforeEach(() => {
    process.env.AI_CONCURRENCY_GATE_MODE = 'redis'
    process.env.AI_CONCURRENCY_GATE_TTL_MS = '60000'
  })

  afterEach(() => {
    process.env.AI_CONCURRENCY_GATE_MODE = originalMode
    process.env.AI_CONCURRENCY_GATE_TTL_MS = originalTtl
    vi.clearAllMocks()
  })

  it('acquires and releases slot via redis scripts', async () => {
    const { queueRedis } = await import('@/lib/redis')
    const evalMock = queueRedis.eval as unknown as ReturnType<typeof vi.fn>
    evalMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

    const { withAiConcurrencyGate } = await import('@/lib/ai-exec/governance')
    const result = await withAiConcurrencyGate({
      scope: 'image',
      userId: 'user-1',
      limit: 1,
      run: async () => 'ok',
    })

    expect(result).toBe('ok')
    expect(evalMock).toHaveBeenCalled()
    const calledKeys = evalMock.mock.calls.map((call) => String(call[2]))
    expect(calledKeys.some((key) => key.includes('ai_concurrency_gate:image:user-1'))).toBe(true)
  })
})

