import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import PgBoss from 'pg-boss'
import { createScopedLogger } from '@/lib/logging/core'

type BackoffConfig = {
  type?: 'fixed' | 'exponential'
  delay?: number
}

export type JobsOptions = {
  removeOnComplete?: number | boolean
  removeOnFail?: number | boolean
  attempts?: number
  backoff?: number | BackoffConfig
  priority?: number
  jobId?: string
}

type QueueOptions = {
  connection?: unknown
  defaultJobOptions?: JobsOptions
}

type WorkerOptions = {
  connection?: unknown
  concurrency?: number
}

type BossSendOptions = {
  id?: string
  priority?: number
  retryLimit?: number
  retryDelay?: number
  retryBackoff?: boolean
}

type BossFetchedJob = {
  id: string
  name: string
  data: unknown
  state?: string
  retryCount?: number
}

type BossJob = {
  id: string
  name: string
  data: unknown
  state?: string
  retryCount?: number
}

type BossApi = {
  start: () => Promise<void>
  stop: () => Promise<void>
  createQueue: (name: string) => Promise<void>
  send: (name: string, data: unknown, options?: BossSendOptions) => Promise<string | null>
  fetch: (name: string, options?: { batchSize?: number; includeMetadata?: boolean }) => Promise<BossFetchedJob[] | null>
  complete: (name: string, id: string, data?: unknown) => Promise<void>
  fail: (name: string, id: string, data?: unknown) => Promise<void>
  cancel: (name: string, id: string | string[]) => Promise<void>
  getJobById: (name: string, id: string, options?: { includeArchive?: boolean }) => Promise<BossJob | null>
}

type QueueEnvelope<T> = {
  taskName: string
  data: T
  opts: JobsOptions
}

type Processor<T> = (job: Job<T>) => Promise<unknown>

type WorkerTicket = {
  id: number
  queueName: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const logger = createScopedLogger({
  module: 'task.queue.runtime',
  action: 'task.queue.runtime',
})

const VERBOSE_QUEUE_LOG_ENABLED = process.env.TASK_QUEUE_VERBOSE_LOG === 'true'

function logQueueRuntimeDebug(input: {
  action: string
  message: string
  details?: Record<string, unknown> | null
}) {
  if (!VERBOSE_QUEUE_LOG_ENABLED) return
  logger.debug({
    action: input.action,
    message: input.message,
    details: input.details || null,
  })
}

const TRANSIENT_DB_ERROR_PATTERNS = [
  /deadlock detected/i,
  /serialization failure/i,
  /could not serialize access/i,
  /connection terminated/i,
  /connection reset/i,
  /timeout/i,
]

function isTransientDbError(error: unknown): boolean {
  const message = toErrorMessage(error)
  return TRANSIENT_DB_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

async function retryWithBackoff<T>(params: {
  maxAttempts: number
  baseDelayMs: number
  action: () => Promise<T>
}) {
  const maxAttempts = Math.max(1, Math.floor(params.maxAttempts))
  let attempt = 1
  while (true) {
    try {
      return await params.action()
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientDbError(error)) {
        throw error
      }
      const delay = Math.min(3_000, params.baseDelayMs * Math.pow(2, attempt - 1))
      await wait(delay)
      attempt += 1
    }
  }
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim())
}

function toDeterministicUuid(source: string): string {
  const hex = createHash('sha256').update(source).digest('hex').slice(0, 32)
  const chars = hex.split('')
  chars[12] = '4'
  chars[16] = 'a'
  const normalized = chars.join('')
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`
}

function normalizeBossJobId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (isUuid(trimmed)) return trimmed.toLowerCase()
  return toDeterministicUuid(trimmed)
}

function resolveBossJobIdCandidates(input: string): string[] {
  const raw = input.trim()
  if (!raw) return []
  const normalized = normalizeBossJobId(raw)
  return normalized === raw ? [raw] : [normalized, raw]
}

function parseRetryDelayMs(backoff: JobsOptions['backoff']): number {
  if (typeof backoff === 'number' && Number.isFinite(backoff)) {
    return Math.max(0, Math.floor(backoff))
  }
  if (!backoff || typeof backoff !== 'object') {
    return 2_000
  }
  const delay = backoff.delay
  if (typeof delay !== 'number' || !Number.isFinite(delay)) {
    return 2_000
  }
  return Math.max(0, Math.floor(delay))
}

function normalizeAttempts(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 5
  }
  return Math.max(1, Math.floor(value))
}

function isBackoffExponential(backoff: JobsOptions['backoff']) {
  if (!backoff || typeof backoff !== 'object') return false
  return backoff.type === 'exponential'
}

function normalizeJobOptions(base: JobsOptions | undefined, override: JobsOptions | undefined): JobsOptions {
  const attempts = normalizeAttempts(override?.attempts ?? base?.attempts)
  return {
    removeOnComplete: override?.removeOnComplete ?? base?.removeOnComplete ?? 500,
    removeOnFail: override?.removeOnFail ?? base?.removeOnFail ?? 500,
    attempts,
    backoff: override?.backoff ?? base?.backoff ?? {
      type: 'exponential',
      delay: 2_000,
    },
    priority: override?.priority ?? base?.priority ?? 0,
    jobId: override?.jobId ?? base?.jobId,
  }
}

class PgBossRuntime {
  private boss: BossApi | null = null
  private bootPromise: Promise<void> | null = null
  private workerSeq = 1
  private readonly workerCountByQueue = new Map<string, Set<number>>()
  private readonly ensuredQueues = new Set<string>()
  private readonly ensuringQueuePromises = new Map<string, Promise<void>>()

  async ensureReady() {
    if (this.bootPromise) {
      try {
        await this.bootPromise
        logQueueRuntimeDebug({
          action: 'task.queue.runtime.ensure_ready.reuse',
          message: 'queue runtime already bootstrapped',
        })
        return
      } catch (error) {
        this.bootPromise = null
        this.boss = null
        logger.error({
          action: 'task.queue.runtime.ensure_ready.reuse_failed',
          message: toErrorMessage(error),
          errorCode: 'QUEUE_RUNTIME_BOOT_FAILED',
          retryable: true,
        })
        throw error
      }
    }

    const startedAt = Date.now()
    this.bootPromise = (async () => {
      const connectionString = process.env.DATABASE_URL
      if (!connectionString) {
        logger.error({
          action: 'task.queue.runtime.boot.missing_database_url',
          message: 'DATABASE_URL 未配置，无法启动队列系统',
          errorCode: 'QUEUE_RUNTIME_MISSING_DATABASE_URL',
          retryable: false,
        })
        throw new Error('DATABASE_URL 未配置，无法启动队列系统')
      }

      const PgBossCtor = PgBoss as unknown as {
        new (connection: string, options?: Record<string, unknown>): BossApi
      }
      const boss = new PgBossCtor(connectionString, {
        schema: process.env.PG_BOSS_SCHEMA || 'pgboss',
      })
      await retryWithBackoff({
        maxAttempts: 4,
        baseDelayMs: 300,
        action: async () => {
          await boss.start()
        },
      })
      this.boss = boss
      logger.info({
        action: 'task.queue.runtime.boot.success',
        message: 'queue runtime started',
        durationMs: Date.now() - startedAt,
        details: {
          schema: process.env.PG_BOSS_SCHEMA || 'pgboss',
        },
      })
    })()

    try {
      await this.bootPromise
    } catch (error) {
      this.bootPromise = null
      this.boss = null
      logger.error({
        action: 'task.queue.runtime.boot.failed',
        message: toErrorMessage(error),
        durationMs: Date.now() - startedAt,
        errorCode: 'QUEUE_RUNTIME_BOOT_FAILED',
        retryable: true,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : {
                message: String(error),
              },
      })
      throw error
    }
  }

  private async ensureQueue(queueName: string) {
    await this.ensureReady()
    if (this.ensuredQueues.has(queueName)) return
    const inFlight = this.ensuringQueuePromises.get(queueName)
    if (inFlight) {
      await inFlight
      return
    }
    const boss = this.boss
    if (!boss) {
      throw new Error('队列系统未初始化')
    }
    const ensurePromise = (async () => {
      const startedAt = Date.now()
      try {
        await retryWithBackoff({
          maxAttempts: 4,
          baseDelayMs: 200,
          action: async () => {
            await boss.createQueue(queueName)
          },
        })
      } catch (error) {
        const message = toErrorMessage(error)
        if (!/already exists/i.test(message)) {
          logger.error({
            action: 'task.queue.runtime.ensure_queue.failed',
            message,
            errorCode: 'QUEUE_CREATE_FAILED',
            retryable: true,
            details: {
              queueName,
            },
          })
          throw error
        }
      }
      this.ensuredQueues.add(queueName)
      logQueueRuntimeDebug({
        action: 'task.queue.runtime.ensure_queue.success',
        message: 'queue ensured',
        details: {
          queueName,
          durationMs: Date.now() - startedAt,
        },
      })
    })()
    this.ensuringQueuePromises.set(queueName, ensurePromise)
    try {
      await ensurePromise
    } finally {
      this.ensuringQueuePromises.delete(queueName)
    }
  }

  async add<T>(queueName: string, taskName: string, data: T, opts: JobsOptions): Promise<{ id: string; opts: JobsOptions }> {
    const startedAt = Date.now()
    await this.ensureQueue(queueName)
    const boss = this.boss
    if (!boss) {
      throw new Error('队列系统未初始化')
    }
    const attempts = normalizeAttempts(opts.attempts)
    const retryDelayMs = parseRetryDelayMs(opts.backoff)
    const explicitJobId =
      typeof opts.jobId === 'string' && opts.jobId.trim()
        ? normalizeBossJobId(opts.jobId)
        : ''
    const sendOptions: BossSendOptions = {
      priority: typeof opts.priority === 'number' ? opts.priority : 0,
      retryLimit: Math.max(0, attempts - 1),
      retryDelay: Math.max(1, Math.ceil(retryDelayMs / 1_000)),
      retryBackoff: isBackoffExponential(opts.backoff),
      ...(explicitJobId ? { id: explicitJobId } : {}),
    }
    const payload: QueueEnvelope<T> = {
      taskName,
      data,
      opts,
    }
    const id = await boss.send(queueName, payload, sendOptions)
    logger.info({
      action: 'task.queue.runtime.add.success',
      message: 'queue message sent',
      durationMs: Date.now() - startedAt,
      details: {
        queueName,
        taskName,
        jobId: id || explicitJobId,
        priority: sendOptions.priority ?? 0,
        retryLimit: sendOptions.retryLimit ?? 0,
        retryDelaySec: sendOptions.retryDelay ?? 0,
        retryBackoff: sendOptions.retryBackoff ?? false,
      },
    })
    return {
      id: id || explicitJobId,
      opts,
    }
  }

  async fetch(queueName: string, batchSize: number): Promise<BossFetchedJob[]> {
    const startedAt = Date.now()
    await this.ensureQueue(queueName)
    const boss = this.boss
    if (!boss) return []
    const rows = await boss.fetch(queueName, {
      batchSize: Math.max(1, batchSize),
      includeMetadata: true,
    })
    if (!rows || !Array.isArray(rows)) {
      logQueueRuntimeDebug({
        action: 'task.queue.runtime.fetch.empty',
        message: 'queue fetch returned empty',
        details: {
          queueName,
          batchSize,
          durationMs: Date.now() - startedAt,
        },
      })
      return []
    }
    if (rows.length > 0 || VERBOSE_QUEUE_LOG_ENABLED) {
      logQueueRuntimeDebug({
        action: 'task.queue.runtime.fetch.success',
        message: 'queue jobs fetched',
        details: {
          queueName,
          batchSize,
          fetchedCount: rows.length,
          durationMs: Date.now() - startedAt,
        },
      })
    }
    return rows
  }

  async complete(queueName: string, jobId: string, result?: unknown) {
    if (!this.boss) return
    await this.boss.complete(queueName, jobId, result)
    logQueueRuntimeDebug({
      action: 'task.queue.runtime.complete',
      message: 'queue job completed',
      details: {
        queueName,
        jobId,
      },
    })
  }

  async fail(queueName: string, jobId: string, error?: unknown) {
    if (!this.boss) return
    await this.boss.fail(queueName, jobId, {
      error: error instanceof Error ? error.message : String(error || 'unknown'),
    })
    logger.warn({
      action: 'task.queue.runtime.fail',
      message: 'queue job marked failed',
      details: {
        queueName,
        jobId,
        error: toErrorMessage(error),
      },
    })
  }

  async cancel(queueName: string, jobId: string) {
    if (!this.boss) return
    await this.boss.cancel(queueName, jobId)
    logQueueRuntimeDebug({
      action: 'task.queue.runtime.cancel',
      message: 'queue job cancelled',
      details: {
        queueName,
        jobId,
      },
    })
  }

  async getJobById(queueName: string, jobId: string): Promise<BossJob | null> {
    await this.ensureReady()
    if (!this.boss) return null
    return await this.boss.getJobById(queueName, jobId, {
      includeArchive: true,
    })
  }

  registerWorker(queueName: string): WorkerTicket {
    const set = this.workerCountByQueue.get(queueName) || new Set<number>()
    const id = this.workerSeq++
    set.add(id)
    this.workerCountByQueue.set(queueName, set)
    logger.info({
      action: 'task.queue.runtime.worker.registered',
      message: 'queue worker registered',
      details: {
        queueName,
        workerId: id,
        workerCount: set.size,
      },
    })
    return { id, queueName }
  }

  unregisterWorker(ticket: WorkerTicket) {
    const set = this.workerCountByQueue.get(ticket.queueName)
    if (!set) return
    set.delete(ticket.id)
    if (set.size <= 0) {
      this.workerCountByQueue.delete(ticket.queueName)
      logger.info({
        action: 'task.queue.runtime.worker.unregistered',
        message: 'queue worker unregistered',
        details: {
          queueName: ticket.queueName,
          workerId: ticket.id,
          workerCount: 0,
        },
      })
      return
    }
    logger.info({
      action: 'task.queue.runtime.worker.unregistered',
      message: 'queue worker unregistered',
      details: {
        queueName: ticket.queueName,
        workerId: ticket.id,
        workerCount: set.size,
      },
    })
  }

  listWorkers(queueName: string) {
    const set = this.workerCountByQueue.get(queueName)
    if (!set) return []
    return Array.from(set.values()).map((id) => ({ id }))
  }
}

const runtime = new PgBossRuntime()

export class UnrecoverableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnrecoverableError'
  }
}

export class Job<T> {
  readonly id: string
  readonly name: string
  readonly data: T
  readonly queueName: string
  readonly opts: JobsOptions
  readonly attemptsMade: number
  private state: string | null

  constructor(input: {
    id: string
    name: string
    data: T
    queueName: string
    opts: JobsOptions
    attemptsMade: number
    state?: string | null
  }) {
    this.id = input.id
    this.name = input.name
    this.data = input.data
    this.queueName = input.queueName
    this.opts = input.opts
    this.attemptsMade = Math.max(0, Math.floor(input.attemptsMade))
    this.state = input.state || null
  }

  async getState() {
    if (this.state) return this.state
    const current = await runtime.getJobById(this.queueName, this.id)
    this.state = current?.state || 'missing'
    return this.state
  }

  async remove() {
    await runtime.cancel(this.queueName, this.id)
  }
}

export class Queue<T> {
  private readonly queueName: string
  private readonly defaultJobOptions: JobsOptions

  constructor(queueName: string, options?: QueueOptions) {
    this.queueName = queueName
    this.defaultJobOptions = normalizeJobOptions(options?.defaultJobOptions, undefined)
  }

  async add(name: string, data: T, opts?: JobsOptions) {
    const merged = normalizeJobOptions(this.defaultJobOptions, opts)
    const inserted = await runtime.add(this.queueName, name, data, merged)
    return new Job<T>({
      id: inserted.id,
      name,
      data,
      queueName: this.queueName,
      opts: inserted.opts,
      attemptsMade: 0,
      state: 'created',
    })
  }

  async getJob(jobId: string) {
    let row: BossJob | null = null
    const candidates = resolveBossJobIdCandidates(jobId)
    for (const candidate of candidates) {
      row = await runtime.getJobById(this.queueName, candidate)
      if (row) break
    }
    if (!row) return null

    const envelope = (row.data || {}) as QueueEnvelope<T>
    const opts = normalizeJobOptions(undefined, envelope.opts)
    return new Job<T>({
      id: row.id,
      name: envelope.taskName || row.name,
      data: envelope.data,
      queueName: this.queueName,
      opts,
      attemptsMade: typeof row.retryCount === 'number' ? row.retryCount : 0,
      state: row.state || null,
    })
  }

  async getWorkers() {
    return runtime.listWorkers(this.queueName)
  }
}

export class Worker<T> extends EventEmitter {
  readonly name: string
  private readonly queueName: string
  private readonly processor: Processor<T>
  private readonly concurrency: number
  private stopped = false
  private running = false
  private activeCount = 0
  private ticket: WorkerTicket | null = null
  private readyEmitted = false

  constructor(queueName: string, processor: Processor<T>, options?: WorkerOptions) {
    super()
    this.name = queueName
    this.queueName = queueName
    this.processor = processor
    this.concurrency = Math.max(1, Math.floor(options?.concurrency || 1))
    this.ticket = runtime.registerWorker(queueName)
    void this.startLoop()
  }

  private async startLoop() {
    if (this.running) return
    this.running = true
    let errorStreak = 0
    try {
      while (!this.stopped) {
        try {
          await runtime.ensureReady()
          if (!this.readyEmitted) {
            this.readyEmitted = true
            this.emit('ready')
          }
          errorStreak = 0

          const remaining = this.concurrency - this.activeCount
          if (remaining <= 0) {
            await wait(120)
            continue
          }

          const jobs = await runtime.fetch(this.queueName, remaining)
          if (jobs.length <= 0) {
            await wait(300)
            continue
          }

          for (const row of jobs) {
            if (this.stopped) break
            this.activeCount += 1
            void this.runSingle(row)
          }
        } catch (error) {
          errorStreak += 1
          this.emit('error', error instanceof Error ? error : new Error(String(error)))
          const delay = Math.min(5_000, 300 * Math.pow(2, Math.min(6, errorStreak - 1)))
          await wait(delay)
        }
      }
    } finally {
      this.running = false
    }
  }

  private async runSingle(row: BossFetchedJob) {
    const envelope = (row.data || {}) as QueueEnvelope<T>
    const job = new Job<T>({
      id: row.id,
      name: envelope.taskName || row.name,
      data: envelope.data,
      queueName: this.queueName,
      opts: normalizeJobOptions(undefined, envelope.opts),
      attemptsMade: typeof row.retryCount === 'number' ? row.retryCount : 0,
      state: row.state || 'active',
    })

    try {
      const result = await this.processor(job)
      await runtime.complete(this.queueName, row.id, result ?? null)
    } catch (error) {
      await runtime.fail(this.queueName, row.id, error)
      this.emit('failed', job, error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1)
    }
  }

  async close() {
    this.stopped = true
    while (this.activeCount > 0 || this.running) {
      await wait(80)
      if (!this.running) break
    }
    if (this.ticket) {
      runtime.unregisterWorker(this.ticket)
      this.ticket = null
    }
  }
}
