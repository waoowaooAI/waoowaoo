import { logError as _ulogError } from '@/lib/logging/core'
import type Redis from 'ioredis'
import { createSubscriber } from '@/lib/redis'

type MessageHandler = (message: string) => void

class SharedSubscriber {
  private readonly subscriber: Redis
  private readonly listeners = new Map<string, Map<number, MessageHandler>>()
  private listenerSeq = 1

  constructor() {
    this.subscriber = createSubscriber()
    this.subscriber.on('message', (channel, message) => {
      const channelListeners = this.listeners.get(channel)
      if (!channelListeners || channelListeners.size === 0) return

      for (const handler of channelListeners.values()) {
        try {
          handler(message)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          _ulogError(`[SSE:shared] listener error channel=${channel} error=${message}`)
        }
      }
    })

    this.subscriber.on('error', (error) => {
      _ulogError(`[SSE:shared] redis error: ${error?.message || 'unknown'}`)
    })
  }

  async addChannelListener(channel: string, handler: MessageHandler): Promise<() => Promise<void>> {
    let channelListeners = this.listeners.get(channel)
    if (!channelListeners) {
      channelListeners = new Map<number, MessageHandler>()
      this.listeners.set(channel, channelListeners)
    }

    const listenerId = this.listenerSeq++
    channelListeners.set(listenerId, handler)

    try {
      if (channelListeners.size === 1) {
        await this.subscriber.subscribe(channel)
      }
    } catch (error) {
      channelListeners.delete(listenerId)
      if (channelListeners.size === 0) {
        this.listeners.delete(channel)
      }
      throw error
    }

    return async () => {
      const listeners = this.listeners.get(channel)
      if (!listeners) return

      listeners.delete(listenerId)
      if (listeners.size > 0) return

      this.listeners.delete(channel)
      try {
        await this.subscriber.unsubscribe(channel)
      } catch {}
    }
  }
}

type GlobalSharedSubscriber = typeof globalThis & {
  __waoowaooSharedSubscriber?: SharedSubscriber
}

const globalForSharedSubscriber = globalThis as GlobalSharedSubscriber

export function getSharedSubscriber() {
  if (!globalForSharedSubscriber.__waoowaooSharedSubscriber) {
    globalForSharedSubscriber.__waoowaooSharedSubscriber = new SharedSubscriber()
  }
  return globalForSharedSubscriber.__waoowaooSharedSubscriber
}
