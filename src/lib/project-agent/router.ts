import { generateObject, type LanguageModel, type UIMessage } from 'ai'
import { z } from 'zod'
import type { ProjectPhaseSnapshot } from './project-phase'
import type { ProjectAgentContext } from './types'
import { normalizeProjectAgentLocale, type ProjectAgentLocale } from './locale'

export type ProjectAgentIntent = 'query' | 'plan' | 'act'

export type ProjectAgentDomain =
  | 'project'
  | 'workflow'
  | 'run'
  | 'task'
  | 'storyboard'
  | 'asset'
  | 'asset-hub'
  | 'voice'
  | 'config'
  | 'billing'
  | 'governance'
  | 'download'
  | 'debug'
  | 'unknown'

export type ProjectAgentToolCategory =
  | 'project-overview'
  | 'workflow-plan'
  | 'workflow-run'
  | 'run-manage'
  | 'task-manage'
  | 'storyboard-read'
  | 'storyboard-edit'
  | 'panel-media'
  | 'asset-character'
  | 'asset-location'
  | 'asset-voice'
  | 'asset-hub'
  | 'config'
  | 'billing'
  | 'governance'
  | 'download'
  | 'debug'

export interface ProjectAgentRouteDecision {
  intent: ProjectAgentIntent
  domains: ProjectAgentDomain[]
  toolCategories: ProjectAgentToolCategory[]
  confidence: number
  needsClarification: boolean
  clarifyingQuestion: string | null
  reasoning: string[]
  latestUserText: string
}

const ROUTER_CONFIDENCE_THRESHOLD = 0.8

const routerSchema = z.object({
  intent: z.enum(['query', 'plan', 'act']),
  domains: z.array(z.enum([
    'project',
    'workflow',
    'run',
    'task',
    'storyboard',
    'asset',
    'asset-hub',
    'voice',
    'config',
    'billing',
    'governance',
    'download',
    'debug',
    'unknown',
  ])).min(1),
  toolCategories: z.array(z.enum([
    'project-overview',
    'workflow-plan',
    'workflow-run',
    'run-manage',
    'task-manage',
    'storyboard-read',
    'storyboard-edit',
    'panel-media',
    'asset-character',
    'asset-location',
    'asset-voice',
    'asset-hub',
    'config',
    'billing',
    'governance',
    'download',
    'debug',
  ])).min(1),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  reasoning: z.array(z.string()).max(8),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const chunks: string[] = []
    for (const part of message.parts) {
      if (!isRecord(part)) continue
      if (part.type !== 'text') continue
      if (typeof part.text !== 'string') continue
      const trimmed = part.text.trim()
      if (trimmed) chunks.push(trimmed)
    }
    const joined = chunks.join('\n').trim()
    if (joined) return joined
  }
  return ''
}

function extractConversationExcerpt(messages: UIMessage[]): string {
  return messages
    .slice(-8)
    .map((message) => {
      const parts = message.parts
        .map((part) => {
          if (!isRecord(part)) return ''
          if (part.type === 'text' && typeof part.text === 'string') return part.text.trim()
          return ''
        })
        .filter(Boolean)
      if (parts.length === 0) return null
      return `${message.role.toUpperCase()}: ${parts.join(' ')}`
    })
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

function buildPhaseSummary(phase: ProjectPhaseSnapshot): string {
  return [
    `phase=${phase.phase}`,
    `activeRuns=${String(phase.activeRunCount)}`,
    `failedItems=${phase.failedItems.join(';') || '-'}`,
    `staleArtifacts=${phase.staleArtifacts.join(';') || '-'}`,
    `actions.plan=${phase.availableActions.planMode.join(',') || '-'}`,
    `actions.act=${phase.availableActions.actMode.join(',') || '-'}`,
  ].join('\n')
}

function buildRouterPrompt(params: {
  locale: ProjectAgentLocale
  latestUserText: string
  conversationExcerpt: string
  phaseSummary: string
  context: ProjectAgentContext
}): { system: string; prompt: string } {
  const episodeId = params.context.episodeId || 'none'
  const stage = params.context.currentStage || 'unknown'

  const categoryList = [
    'project-overview',
    'workflow-plan',
    'workflow-run',
    'run-manage',
    'task-manage',
    'storyboard-read',
    'storyboard-edit',
    'panel-media',
    'asset-character',
    'asset-location',
    'asset-voice',
    'asset-hub',
    'config',
    'billing',
    'governance',
    'download',
    'debug',
  ].join(', ')

  if (params.locale === 'en') {
    return {
      system: [
        'You are a strict project assistant router.',
        'Your task is to classify the user turn before the main assistant acts.',
        'Use high confidence only when the user goal is genuinely clear.',
        'If the request is ambiguous, set needsClarification=true and provide one short clarifyingQuestion.',
        'If a tool category might be needed, include it. Prefer recall over aggressive exclusion.',
        'Do not rely on previous rule routing. Output only from the provided schema.',
        `Allowed toolCategories: ${categoryList}`,
      ].join('\n'),
      prompt: [
        `episodeId=${episodeId}`,
        `currentStage=${stage}`,
        '',
        'Phase summary:',
        params.phaseSummary,
        '',
        'Recent conversation excerpt:',
        params.conversationExcerpt || 'NONE',
        '',
        'Latest user request:',
        params.latestUserText || 'NONE',
      ].join('\n'),
    }
  }

  return {
    system: [
      '你是一个严格的项目 assistant 路由器。',
      '你的任务是在主 assistant 执行前，对当前用户请求做结构化分类。',
      '只有当用户目标真的明确时，才能给高置信度。',
      '如果请求有歧义，必须设置 needsClarification=true，并提供一个简短的 clarifyingQuestion。',
      '如果某个工具类别可能需要用到，就把它包含进去。宁可高召回，不要激进排除。',
      '禁止依赖旧的规则路由，必须只按 schema 输出。',
      `允许的 toolCategories: ${categoryList}`,
    ].join('\n'),
    prompt: [
      `episodeId=${episodeId}`,
      `currentStage=${stage}`,
      '',
      '阶段摘要：',
      params.phaseSummary,
      '',
      '最近对话摘录：',
      params.conversationExcerpt || 'NONE',
      '',
      '最新用户请求：',
      params.latestUserText || 'NONE',
    ].join('\n'),
  }
}

export async function routeProjectAgentRequest(input: {
  messages: UIMessage[]
  phase: ProjectPhaseSnapshot
  context: ProjectAgentContext
  model: LanguageModel
}): Promise<ProjectAgentRouteDecision> {
  const latestUserText = extractLatestUserText(input.messages)
  if (!latestUserText) {
    return {
      intent: 'query',
      domains: ['unknown'],
      toolCategories: ['project-overview'],
      confidence: 0,
      needsClarification: true,
      clarifyingQuestion: normalizeProjectAgentLocale(input.context.locale) === 'en'
        ? 'What do you want me to help with in this project?'
        : '你希望我在这个项目里帮你处理什么？',
      reasoning: ['router:empty-user-text'],
      latestUserText,
    }
  }

  const locale = normalizeProjectAgentLocale(input.context.locale)
  const prompt = buildRouterPrompt({
    locale,
    latestUserText,
    conversationExcerpt: extractConversationExcerpt(input.messages),
    phaseSummary: buildPhaseSummary(input.phase),
    context: input.context,
  })

  const result = await generateObject({
    model: input.model,
    schema: routerSchema,
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: 0,
  })

  const object = result.object
  const confidence = Math.max(0, Math.min(1, Math.round(object.confidence * 100) / 100))
  const clarificationRequired = object.needsClarification || confidence < ROUTER_CONFIDENCE_THRESHOLD
  const clarifyingQuestion = clarificationRequired
    ? (object.clarifyingQuestion?.trim()
      || (locale === 'en'
        ? 'Please clarify the exact action or outcome you want.'
        : '请补充你希望我执行的具体动作或目标结果。'))
    : null

  return {
    intent: object.intent,
    domains: Array.from(new Set(object.domains)),
    toolCategories: Array.from(new Set(object.toolCategories)),
    confidence,
    needsClarification: clarificationRequired,
    clarifyingQuestion,
    reasoning: object.reasoning,
    latestUserText,
  }
}
