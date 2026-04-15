import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const redisInstances: Array<{ config: Record<string, unknown>; on: ReturnType<typeof vi.fn> }> = []

const RedisMock = vi.hoisted(() => vi.fn().mockImplementation((config: Record<string, unknown>) => {
  const instance = {
    config,
    on: vi.fn(),
  }
  redisInstances.push(instance)
  return instance
}))

vi.mock('ioredis', () => ({
  default: RedisMock,
}))

vi.mock('@/lib/logging/core', () => ({
  logDebug: vi.fn(),
  logError: vi.fn(),
}))

describe('redis config', () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.resetModules()
    RedisMock.mockClear()
    redisInstances.length = 0
    mutableEnv.NODE_ENV = 'production'
    delete (globalThis as typeof globalThis & { __waoowaooRedis?: unknown }).__waoowaooRedis
  })

  afterEach(() => {
    mutableEnv.NODE_ENV = originalEnv
  })

  it('module import keeps redis clients lazy in non-test environments', async () => {
    const redisModule = await import('@/lib/redis')

    expect(redisModule.redis).toBeDefined()
    expect(redisModule.queueRedis).toBeDefined()
    expect(RedisMock).not.toHaveBeenCalled()

    void redisModule.redis.status
    void redisModule.queueRedis.status

    expect(RedisMock).toHaveBeenCalledTimes(2)
    expect(redisInstances[0]?.config.lazyConnect).toBe(true)
    expect(redisInstances[1]?.config.lazyConnect).toBe(true)
  })

  it('createSubscriber also uses lazy redis connections', async () => {
    const redisModule = await import('@/lib/redis')

    redisModule.createSubscriber()

    expect(RedisMock).toHaveBeenCalledTimes(1)
    expect(redisInstances[0]?.config.lazyConnect).toBe(true)
  })
})
