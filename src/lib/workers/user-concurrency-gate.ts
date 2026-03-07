type ConcurrencyScope = 'image' | 'video'

interface GateState {
  active: number
  waitingResolvers: Array<() => void>
}

const gateStateMap = new Map<string, GateState>()

function getGateState(key: string): GateState {
  const existing = gateStateMap.get(key)
  if (existing) return existing
  const created: GateState = { active: 0, waitingResolvers: [] }
  gateStateMap.set(key, created)
  return created
}

function cleanupGateStateIfIdle(key: string) {
  const state = gateStateMap.get(key)
  if (!state) return
  if (state.active === 0 && state.waitingResolvers.length === 0) {
    gateStateMap.delete(key)
  }
}

async function acquireSlot(key: string, limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`WORKFLOW_CONCURRENCY_INVALID: ${limit}`)
  }

  const state = getGateState(key)
  if (state.active < limit) {
    state.active += 1
    return
  }

  await new Promise<void>((resolve) => {
    state.waitingResolvers.push(resolve)
  })
}

function releaseSlot(key: string) {
  const state = gateStateMap.get(key)
  if (!state) return

  if (state.waitingResolvers.length > 0) {
    const nextResolver = state.waitingResolvers.shift()
    nextResolver?.()
    return
  }

  state.active = Math.max(0, state.active - 1)
  cleanupGateStateIfIdle(key)
}

export async function withUserConcurrencyGate<T>(input: {
  scope: ConcurrencyScope
  userId: string
  limit: number
  run: () => Promise<T>
}): Promise<T> {
  const key = `${input.scope}:${input.userId}`
  await acquireSlot(key, input.limit)
  try {
    return await input.run()
  } finally {
    releaseSlot(key)
  }
}
