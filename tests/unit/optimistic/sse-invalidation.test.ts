import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query/keys'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE } from '@/lib/task/types'

type InvalidateArg = { queryKey?: readonly unknown[]; exact?: boolean }

type EffectCleanup = (() => void) | void

const runtime = vi.hoisted(() => ({
  queryClient: {
    invalidateQueries: vi.fn(async (_arg?: InvalidateArg) => undefined),
  },
  effectCleanup: null as EffectCleanup,
  scheduledTimers: [] as Array<() => void>,
}))

const overlayMock = vi.hoisted(() => ({
  applyTaskLifecycleToOverlay: vi.fn(),
}))

class FakeEventSource {
  static OPEN = 1
  static instances: FakeEventSource[] = []

  readonly url: string
  readyState = FakeEventSource.OPEN
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  private listeners = new Map<string, Set<EventListener>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, handler: EventListener) {
    const set = this.listeners.get(type) || new Set<EventListener>()
    set.add(handler)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, handler: EventListener) {
    const set = this.listeners.get(type)
    if (!set) return
    set.delete(handler)
  }

  emit(type: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent
    if (this.onmessage) this.onmessage(event)
    const set = this.listeners.get(type)
    if (!set) return
    for (const handler of set) {
      handler(event as unknown as Event)
    }
  }

  close() {
    this.readyState = 2
  }
}

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useRef: <T,>(value: T) => ({ current: value }),
    useEffect: (effect: () => EffectCleanup) => {
      runtime.effectCleanup = effect()
    },
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => runtime.queryClient,
}))

vi.mock('@/lib/query/task-target-overlay', () => overlayMock)

function hasInvalidation(predicate: (arg: InvalidateArg) => boolean) {
  return runtime.queryClient.invalidateQueries.mock.calls.some((call) => {
    const arg = (call[0] || {}) as InvalidateArg
    return predicate(arg)
  })
}

describe('sse invalidation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.effectCleanup = null
    runtime.scheduledTimers = []
    FakeEventSource.instances = []

    ;(globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource
    ;(globalThis as unknown as { window: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window = {
      setTimeout: ((cb: () => void) => {
        runtime.scheduledTimers.push(cb)
        return runtime.scheduledTimers.length as unknown as ReturnType<typeof setTimeout>
      }) as unknown as typeof setTimeout,
      clearTimeout: (() => undefined) as unknown as typeof clearTimeout,
    }
  })

  it('PROCESSING(progress 数值) 不触发 target-state invalidation；COMPLETED 触发', async () => {
    const { useSSE } = await import('@/lib/query/hooks/useSSE')

    useSSE({
      projectId: 'project-1',
      episodeId: 'episode-1',
      enabled: true,
    })

    const source = FakeEventSource.instances[0]
    expect(source).toBeTruthy()

    source.emit(TASK_SSE_EVENT_TYPE.LIFECYCLE, {
      type: TASK_SSE_EVENT_TYPE.LIFECYCLE,
      taskId: 'task-1',
      taskType: 'IMAGE_CHARACTER',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      episodeId: 'episode-1',
      payload: {
        lifecycleType: TASK_EVENT_TYPE.PROCESSING,
        progress: 32,
      },
    })

    expect(hasInvalidation((arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key) && key[0] === 'task-target-states'
    })).toBe(false)

    source.emit(TASK_SSE_EVENT_TYPE.LIFECYCLE, {
      type: TASK_SSE_EVENT_TYPE.LIFECYCLE,
      taskId: 'task-1',
      taskType: 'IMAGE_CHARACTER',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      episodeId: 'episode-1',
      payload: {
        lifecycleType: TASK_EVENT_TYPE.COMPLETED,
      },
    })

    for (const cb of runtime.scheduledTimers) cb()

    expect(hasInvalidation((arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.tasks.targetStatesAll('project-1')[0]
        && key[1] === 'project-1'
        && arg.exact === false
    })).toBe(true)

    expect(overlayMock.applyTaskLifecycleToOverlay).toHaveBeenCalledWith(
      runtime.queryClient,
      expect.objectContaining({
        projectId: 'project-1',
        lifecycleType: TASK_EVENT_TYPE.COMPLETED,
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
      }),
    )
  })
})
