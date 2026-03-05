import { logWarn as _ulogWarn } from '@/lib/logging/core'

type PublishResult = number

type RedisLike = {
  publish: (channel: string, payload: string) => Promise<PublishResult>
}

type QueueRedisLike = Record<string, never>

const NO_REDIS_MESSAGE = 'Redis 已移除：事件通道改为 PostgreSQL 持久事件轮询。'

export const redis: RedisLike = {
  async publish(channel: string, payload: string) {
    _ulogWarn(`[RedisStub] publish ignored channel=${channel} bytes=${Buffer.byteLength(payload)} reason=${NO_REDIS_MESSAGE}`)
    return 0
  },
}

export const queueRedis: QueueRedisLike = {}

export function createSubscriber() {
  throw new Error(NO_REDIS_MESSAGE)
}
