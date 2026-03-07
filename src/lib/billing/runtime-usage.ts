import { AsyncLocalStorage } from 'node:async_hooks'

export interface TextUsageEntry {
  model: string
  inputTokens: number
  outputTokens: number
}

type TextUsageStore = {
  textUsage: TextUsageEntry[]
}

const usageStore = new AsyncLocalStorage<TextUsageStore>()

export async function withTextUsageCollection<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; textUsage: TextUsageEntry[] }> {
  return await usageStore.run({ textUsage: [] }, async () => {
    const result = await fn()
    const store = usageStore.getStore()
    return {
      result,
      textUsage: store?.textUsage ? [...store.textUsage] : [],
    }
  })
}

export function recordTextUsage(entry: TextUsageEntry) {
  const store = usageStore.getStore()
  if (!store) return
  store.textUsage.push({
    model: entry.model,
    inputTokens: Math.max(0, Math.floor(entry.inputTokens || 0)),
    outputTokens: Math.max(0, Math.floor(entry.outputTokens || 0)),
  })
}
