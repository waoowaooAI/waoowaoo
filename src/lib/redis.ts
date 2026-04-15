import { logDebug as _ulogDebug, logError as _ulogError } from '@/lib/logging/core'
import Redis from 'ioredis'

type RedisSingleton = {
  app?: Redis
  queue?: Redis
}

const globalForRedis = globalThis as typeof globalThis & {
  __waoowaooRedis?: RedisSingleton
}

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT || '6379', 10) || 6379
const REDIS_USERNAME = process.env.REDIS_USERNAME
const REDIS_PASSWORD = process.env.REDIS_PASSWORD
const REDIS_TLS = process.env.REDIS_TLS === 'true'
function buildBaseConfig() {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    tls: REDIS_TLS ? {} : undefined,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times: number) {
      // Exponential backoff capped at 30s.
      return Math.min(2 ** Math.min(times, 10) * 100, 30_000)
    },
  }
}

function onConnectLog(scope: string, client: Redis) {
  client.on('connect', () => _ulogDebug(`[Redis:${scope}] connected ${REDIS_HOST}:${REDIS_PORT}`))
  client.on('error', (err) => _ulogError(`[Redis:${scope}] error:`, err.message))
}

function createAppRedis() {
  const client = new Redis({
    ...buildBaseConfig(),
    maxRetriesPerRequest: 2,
  })
  onConnectLog('app', client)
  return client
}

function createQueueRedis() {
  const client = new Redis({
    ...buildBaseConfig(),
    // BullMQ requires null to avoid command retry side effects.
    maxRetriesPerRequest: null,
  })
  onConnectLog('queue', client)
  return client
}

const singleton = globalForRedis.__waoowaooRedis || {}
if (!globalForRedis.__waoowaooRedis) {
  globalForRedis.__waoowaooRedis = singleton
}

function getAppRedis() {
  return singleton.app || (singleton.app = createAppRedis())
}

function getQueueRedis() {
  return singleton.queue || (singleton.queue = createQueueRedis())
}

function createLazyRedisProxy(getClient: () => Redis) {
  return new Proxy({} as Redis, {
    get(_target, prop, receiver) {
      const client = getClient() as unknown as Record<PropertyKey, unknown>
      const value = Reflect.get(client, prop, receiver)
      return typeof value === 'function' ? value.bind(client) : value
    },
    set(_target, prop, value, receiver) {
      return Reflect.set(getClient() as unknown as Record<PropertyKey, unknown>, prop, value, receiver)
    },
    has(_target, prop) {
      return prop in (getClient() as unknown as Record<PropertyKey, unknown>)
    },
    ownKeys() {
      return Reflect.ownKeys(getClient() as unknown as Record<PropertyKey, unknown>)
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(getClient() as unknown as Record<PropertyKey, unknown>, prop)
    },
  })
}

export const redis = createLazyRedisProxy(getAppRedis)
export const queueRedis = createLazyRedisProxy(getQueueRedis)

export function createSubscriber() {
  const client = new Redis({
    ...buildBaseConfig(),
    maxRetriesPerRequest: null,
  })
  onConnectLog('sub', client)
  return client
}
