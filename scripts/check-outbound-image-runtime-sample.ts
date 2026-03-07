import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'

type AnyJson = unknown

type Match = {
  path: string
  value: string
}

type Options = {
  minutes: number
  limit: number
  projectId: string | null
  strictNoData: boolean
  includeEvents: boolean
  maxEventsPerTask: number
  json: boolean
}

type FailureType = 'normalize' | 'model' | 'cancelled' | 'other'

const MODEL_ERROR_CODES = new Set([
  'GENERATION_FAILED',
  'GENERATION_TIMEOUT',
  'RATE_LIMIT',
  'EXTERNAL_ERROR',
  'SENSITIVE_CONTENT',
])

function parseNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number.parseInt(raw.split('=')[1] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function parseStringArg(name: string): string | null {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return null
  const value = (raw.split('=')[1] || '').trim()
  return value || null
}

function parseBooleanArg(name: string, fallback = false): boolean {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = (raw.split('=')[1] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function parseOptions(): Options {
  return {
    minutes: parseNumberArg('minutes', 60 * 24),
    limit: parseNumberArg('limit', 200),
    projectId: parseStringArg('projectId'),
    strictNoData: parseBooleanArg('strictNoData', false),
    includeEvents: parseBooleanArg('includeEvents', false),
    maxEventsPerTask: parseNumberArg('maxEventsPerTask', 40),
    json: parseBooleanArg('json', false),
  }
}

function toExcerpt(value: string, max = 180): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function findStringMatches(
  value: AnyJson,
  predicate: (input: string) => boolean,
  path = '$',
  matches: Match[] = [],
): Match[] {
  if (typeof value === 'string') {
    if (predicate(value)) matches.push({ path, value })
    return matches
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findStringMatches(item, predicate, `${path}[${index}]`, matches)
    })
    return matches
  }
  if (value && typeof value === 'object') {
    for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
      findStringMatches(next, predicate, `${path}.${key}`, matches)
    }
  }
  return matches
}

function classifyFailure(task: {
  errorCode: string | null
  errorMessage: string | null
  result: AnyJson | null
  events: Array<{ payload: AnyJson | null }>
}): FailureType {
  const code = (task.errorCode || '').trim().toUpperCase()
  const normalizeRe = /normalize|video_frame_normalize|normalizeReferenceImagesForGeneration|reference image normalize failed|outbound image input is empty|relative_path_rejected/i
  const modelRe = /generation failed|provider|upstream|rate limit|timed out|timeout|sensitive/i

  if (code === 'TASK_CANCELLED') return 'cancelled'
  if (MODEL_ERROR_CODES.has(code)) return 'model'
  if (code) {
    const explicitNormalizeCode = code === 'INVALID_PARAMS' || code === 'OUTBOUND_IMAGE_FETCH_FAILED'
    if (explicitNormalizeCode) return 'normalize'
    return 'other'
  }

  const values: string[] = []
  if (code) values.push(code)
  if (task.errorMessage) values.push(task.errorMessage)
  if (task.result) {
    for (const hit of findStringMatches(task.result, () => true)) {
      values.push(hit.value)
    }
  }
  for (const event of task.events) {
    if (!event.payload) continue
    for (const hit of findStringMatches(event.payload, () => true)) {
      values.push(hit.value)
    }
  }

  if (values.some((item) => normalizeRe.test(item))) return 'normalize'
  if (values.some((item) => modelRe.test(item))) return 'model'
  return 'other'
}

async function main() {
  const options = parseOptions()
  const since = new Date(Date.now() - options.minutes * 60_000)
  const monitoredTypes = [
    TASK_TYPE.MODIFY_ASSET_IMAGE,
    TASK_TYPE.ASSET_HUB_MODIFY,
    TASK_TYPE.VIDEO_PANEL,
  ]

  const tasks = await prisma.task.findMany({
    where: {
      type: { in: monitoredTypes },
      createdAt: { gte: since },
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
    select: {
      id: true,
      type: true,
      status: true,
      projectId: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      errorCode: true,
      errorMessage: true,
      payload: true,
      result: true,
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit,
  })

  if (tasks.length === 0) {
    process.stdout.write(
      `[check:outbound-image-runtime-sample] no data window=${options.minutes}m limit=${options.limit} strictNoData=${options.strictNoData}\n`,
    )
    if (options.strictNoData) process.exit(2)
    return
  }

  const eventsByTaskId = new Map<string, Array<{ eventType: string; payload: AnyJson | null; createdAt: Date }>>()
  let eventCount = 0
  if (options.includeEvents) {
    for (const task of tasks) {
      const rows = await prisma.taskEvent.findMany({
        where: { taskId: task.id },
        select: {
          taskId: true,
          eventType: true,
          payload: true,
          createdAt: true,
        },
        orderBy: { id: 'desc' },
        take: options.maxEventsPerTask,
      })
      const ordered = [...rows].reverse()
      eventCount += ordered.length
      if (ordered.length > 0) {
        eventsByTaskId.set(
          task.id,
          ordered.map((event) => ({
            eventType: event.eventType,
            payload: event.payload,
            createdAt: event.createdAt,
          })),
        )
      }
    }
  }

  const nextImagePredicate = (input: string) => input.includes('/_next/image')
  const hits: Array<{
    taskId: string
    taskType: string
    source: 'task.payload' | 'task.result' | 'task.event'
    path: string
    value: string
  }> = []

  let failedCount = 0
  const failedByClass: Record<FailureType, number> = {
    normalize: 0,
    model: 0,
    cancelled: 0,
    other: 0,
  }
  const failedByCode: Record<string, number> = {}

  for (const task of tasks) {
    const taskEventsForTask = eventsByTaskId.get(task.id) || []

    if (task.payload) {
      for (const match of findStringMatches(task.payload, nextImagePredicate)) {
        hits.push({
          taskId: task.id,
          taskType: task.type,
          source: 'task.payload',
          path: match.path,
          value: match.value,
        })
      }
    }

    if (task.result) {
      for (const match of findStringMatches(task.result, nextImagePredicate)) {
        hits.push({
          taskId: task.id,
          taskType: task.type,
          source: 'task.result',
          path: match.path,
          value: match.value,
        })
      }
    }

    for (const event of taskEventsForTask) {
      if (!event.payload) continue
      for (const match of findStringMatches(event.payload, nextImagePredicate)) {
        hits.push({
          taskId: task.id,
          taskType: task.type,
          source: 'task.event',
          path: match.path,
          value: match.value,
        })
      }
    }

    if (task.status === 'failed') {
      failedCount += 1
      const code = (task.errorCode || 'UNKNOWN').trim() || 'UNKNOWN'
      failedByCode[code] = (failedByCode[code] || 0) + 1
      const failureType = classifyFailure({
        errorCode: task.errorCode,
        errorMessage: task.errorMessage,
        result: task.result,
        events: taskEventsForTask,
      })
      failedByClass[failureType] += 1
    }
  }

  const typeCount = tasks.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1
    return acc
  }, {})

  process.stdout.write(
    `[check:outbound-image-runtime-sample] window=${options.minutes}m sampled=${tasks.length} events=${eventCount} includeEvents=${options.includeEvents} next_image_hits=${hits.length}\n`,
  )
  process.stdout.write(`[check:outbound-image-runtime-sample] task_types=${JSON.stringify(typeCount)}\n`)
  process.stdout.write(
    `[check:outbound-image-runtime-sample] failures total=${failedCount} normalize=${failedByClass.normalize} model=${failedByClass.model} cancelled=${failedByClass.cancelled} other=${failedByClass.other} by_code=${JSON.stringify(failedByCode)}\n`,
  )

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        windowMinutes: options.minutes,
        sampled: tasks.length,
        events: eventCount,
        includeEvents: options.includeEvents,
        nextImageHits: hits.length,
        taskTypes: typeCount,
        failures: {
          total: failedCount,
          byClass: failedByClass,
          byCode: failedByCode,
        },
      })}\n`,
    )
  }

  if (hits.length > 0) {
    process.stderr.write('[check:outbound-image-runtime-sample] found /_next/image contamination:\n')
    for (const hit of hits.slice(0, 20)) {
      process.stderr.write(
        `- task=${hit.taskId} type=${hit.taskType} source=${hit.source} path=${hit.path} value=${toExcerpt(hit.value)}\n`,
      )
    }
    process.exit(1)
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[check:outbound-image-runtime-sample] failed: ${message}\n`)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
