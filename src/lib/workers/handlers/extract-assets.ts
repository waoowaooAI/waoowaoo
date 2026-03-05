import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type ExtractType = 'characters' | 'locations' | 'props'

type SegmentSource = {
  id: string
  summary: string | null
  content: string | null
  location: string | null
  characters: unknown
  props: unknown
}

type CandidateName = {
  name: string
  aliases: string[]
}

type MergedItem = {
  name: string
  aliases: Set<string>
  sourceSegmentIds: Set<string>
  sourceSnippets: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '').toLowerCase()
}

function splitCanonicalAndAliases(raw: string): CandidateName | null {
  const value = raw.trim()
  if (!value) return null
  const parenMatch = value.match(/^(.+?)[（(]([^）)]+)[）)]$/)
  if (parenMatch) {
    const name = parenMatch[1]?.trim() || ''
    const aliases = (parenMatch[2] || '')
      .split(/[、,，/|｜]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    if (!name) return null
    return { name, aliases }
  }
  const tokens = value
    .split(/[\/|｜]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (tokens.length === 0) return null
  return {
    name: tokens[0],
    aliases: tokens.slice(1),
  }
}

function parseNameCandidates(value: unknown): CandidateName[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseNameCandidates(item))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return parseNameCandidates(JSON.parse(trimmed) as unknown)
      } catch {
        return splitCanonicalAndAliases(trimmed) ? [splitCanonicalAndAliases(trimmed)!] : []
      }
    }
    const parsed = splitCanonicalAndAliases(trimmed)
    return parsed ? [parsed] : []
  }
  if (isRecord(value)) {
    const name = readText(value.name)
    if (!name) return []
    const aliases = Array.isArray(value.aliases)
      ? value.aliases.map((item) => readText(item)).filter((item) => item.length > 0)
      : []
    return [{ name, aliases }]
  }
  return []
}

function extractMentionNames(context: string): CandidateName[] {
  const regex = /\[@([^\]]+)\]/g
  const names: CandidateName[] = []
  let match: RegExpExecArray | null = regex.exec(context)
  while (match) {
    const parsed = splitCanonicalAndAliases(match[1] || '')
    if (parsed) names.push(parsed)
    match = regex.exec(context)
  }
  return names
}

function mergeCandidates(input: {
  candidates: Array<{ name: string; aliases: string[]; segmentId?: string; snippet?: string }>
}): MergedItem[] {
  const map = new Map<string, MergedItem>()
  for (const candidate of input.candidates) {
    const baseName = candidate.name.trim()
    if (!baseName) continue
    const key = normalizeKey(baseName)
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, {
        name: baseName,
        aliases: new Set<string>(),
        sourceSegmentIds: new Set<string>(),
        sourceSnippets: new Set<string>(),
      })
    }
    const item = map.get(key)
    if (!item) continue
    for (const alias of candidate.aliases) {
      const cleaned = alias.trim()
      if (!cleaned || normalizeKey(cleaned) === key) continue
      item.aliases.add(cleaned)
    }
    if (candidate.segmentId) item.sourceSegmentIds.add(candidate.segmentId)
    if (candidate.snippet) item.sourceSnippets.add(candidate.snippet)
  }
  return Array.from(map.values())
}

function snippetFromSegment(segment: SegmentSource): string {
  const summary = readText(segment.summary)
  if (summary) return summary.slice(0, 48)
  return readText(segment.content).slice(0, 48)
}

async function persistCharacters(projectId: string, items: MergedItem[]) {
  for (const item of items) {
    const aliases = Array.from(item.aliases)
    const sourceSegmentIds = Array.from(item.sourceSegmentIds).join(',')
    const introduction = sourceSegmentIds
      ? `提取来源片段: ${sourceSegmentIds}`
      : '提取来源片段: context_only'
    await prisma.character.upsert({
      where: {
        projectId_name: {
          projectId,
          name: item.name,
        },
      },
      create: {
        projectId,
        name: item.name,
        aliases,
        introduction,
      },
      update: {
        aliases,
        introduction,
      },
    })
  }
}

async function persistLocations(projectId: string, items: MergedItem[]) {
  for (const item of items) {
    const sourceSegmentIds = Array.from(item.sourceSegmentIds).join(',')
    const summary = sourceSegmentIds
      ? `提取来源片段: ${sourceSegmentIds}`
      : '提取来源片段: context_only'
    await prisma.location.upsert({
      where: {
        projectId_name: {
          projectId,
          name: item.name,
        },
      },
      create: {
        projectId,
        name: item.name,
        summary,
      },
      update: {
        summary,
      },
    })
  }
}

async function persistProps(projectId: string, items: MergedItem[]) {
  for (const item of items) {
    const sourceSegmentIds = Array.from(item.sourceSegmentIds).join(',')
    const description = sourceSegmentIds
      ? `提取来源片段: ${sourceSegmentIds}`
      : '提取来源片段: context_only'
    await prisma.prop.upsert({
      where: {
        projectId_name: {
          projectId,
          name: item.name,
        },
      },
      create: {
        projectId,
        name: item.name,
        description,
      },
      update: {
        description,
      },
    })
  }
}

function resolveExtractType(taskType: string, payloadExtractType: unknown): ExtractType {
  if (taskType === TASK_TYPE.EXTRACT_CHARACTERS_LLM) return 'characters'
  if (taskType === TASK_TYPE.EXTRACT_LOCATIONS_LLM) return 'locations'
  if (taskType === TASK_TYPE.EXTRACT_PROPS_LLM) return 'props'
  const fallback = readText(payloadExtractType)
  if (fallback === 'characters' || fallback === 'locations' || fallback === 'props') return fallback
  throw new Error(`Unsupported extract task type: ${taskType}`)
}

function collectCandidates(input: {
  extractType: ExtractType
  segments: SegmentSource[]
  context: string
}): Array<{ name: string; aliases: string[]; segmentId?: string; snippet?: string }> {
  const candidates: Array<{ name: string; aliases: string[]; segmentId?: string; snippet?: string }> = []
  for (const segment of input.segments) {
    const snippet = snippetFromSegment(segment)
    if (input.extractType === 'characters') {
      const parsed = parseNameCandidates(segment.characters)
      for (const candidate of parsed) {
        candidates.push({
          name: candidate.name,
          aliases: candidate.aliases,
          segmentId: segment.id,
          snippet,
        })
      }
    } else if (input.extractType === 'locations') {
      const name = readText(segment.location)
      if (name) {
        candidates.push({
          name,
          aliases: [],
          segmentId: segment.id,
          snippet,
        })
      }
    } else {
      const parsed = parseNameCandidates(segment.props)
      for (const candidate of parsed) {
        candidates.push({
          name: candidate.name,
          aliases: candidate.aliases,
          segmentId: segment.id,
          snippet,
        })
      }
    }
  }

  if (input.extractType === 'characters') {
    for (const mention of extractMentionNames(input.context)) {
      candidates.push({
        name: mention.name,
        aliases: mention.aliases,
      })
    }
  }

  return candidates
}

export async function handleExtractAssetsTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const extractType = resolveExtractType(job.data.type, payload.extractType)
  const context = readText(payload.context)

  await reportTaskProgress(job, 20, {
    stage: 'asset_extract_collect',
    stageLabel: '收集抽取输入',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'asset_extract_collect')

  const segments = await prisma.segment.findMany({
    where: {
      episode: {
        projectId,
      },
    },
    select: {
      id: true,
      summary: true,
      content: true,
      location: true,
      characters: true,
      props: true,
    },
  })

  const rawCandidates = collectCandidates({
    extractType,
    segments,
    context,
  })
  if (rawCandidates.length === 0) {
    throw new Error(`未找到可提取的${extractType}候选项`)
  }

  const merged = mergeCandidates({
    candidates: rawCandidates,
  })
  if (merged.length === 0) {
    throw new Error(`未生成有效的${extractType}结构化结果`)
  }

  await reportTaskProgress(job, 70, {
    stage: 'asset_extract_persist',
    stageLabel: '保存提取结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'asset_extract_persist')

  if (extractType === 'characters') {
    await persistCharacters(projectId, merged)
  } else if (extractType === 'locations') {
    await persistLocations(projectId, merged)
  } else {
    await persistProps(projectId, merged)
  }

  await reportTaskProgress(job, 96, {
    stage: 'asset_extract_done',
    stageLabel: '资产抽取完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    extractType,
    extractionSchema: {
      schema: 'asset_extract',
      version: 'v2',
      sourceRefField: 'sourceSegmentIds',
    },
    dedupe: {
      inputCount: rawCandidates.length,
      outputCount: merged.length,
    },
    items: merged.map((item) => ({
      name: item.name,
      aliases: Array.from(item.aliases),
      sourceSegmentIds: Array.from(item.sourceSegmentIds),
      sourceSnippets: Array.from(item.sourceSnippets),
    })),
  }
}
