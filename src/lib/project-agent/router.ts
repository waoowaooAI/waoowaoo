import type { UIMessage } from 'ai'
import type { ProjectPhaseSnapshot } from './project-phase'
import type { ProjectAgentContext } from './types'
import { TOOL_PROFILE_MODE } from './tool-selection'

export type ProjectAgentIntent = 'query' | 'plan' | 'act'

export type ProjectAgentDomain =
  | 'project'
  | 'workflow'
  | 'run'
  | 'task'
  | 'storyboard'
  | 'panel'
  | 'character'
  | 'location'
  | 'voice'
  | 'asset-hub'
  | 'config'
  | 'billing'
  | 'governance'
  | 'download'
  | 'media'
  | 'debug'
  | 'unknown'

export type ProjectAgentNodeId =
  | 'project_overview'
  | 'workflow_plan'
  | 'workflow_run'
  | 'task_manage'
  | 'run_manage'
  | 'storyboard_read'
  | 'storyboard_edit'
  | 'panel_media_generate'
  | 'project_assets_read'
  | 'project_assets_edit'
  | 'asset_hub_read'
  | 'config_models'
  | 'billing_costs'
  | 'governance_recovery'
  | 'downloads_exports'
  | 'debug_tools'
  | 'unknown'

export interface ProjectAgentTriageResult {
  intent: ProjectAgentIntent
  domains: ProjectAgentDomain[]
  confidence: number
  reasonCodes: string[]
}

export interface ProjectAgentRouteDecision extends ProjectAgentTriageResult {
  nodeId: ProjectAgentNodeId
  latestUserText: string
}

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

function hasAny(text: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (text.includes(pattern)) return true
  }
  return false
}

function detectIntent(
  latestUserText: string,
  automationMode: 'explore' | 'edit' | 'generate' | 'recover',
): { intent: ProjectAgentIntent; reasonCodes: string[]; confidence: number } {
  const text = latestUserText.trim()
  if (!text) {
    return {
      intent: 'query',
      reasonCodes: ['intent:empty->query'],
      confidence: 0.2,
    }
  }
  const lower = text.toLowerCase()

  const actHints = [
    '帮我',
    '请',
    '麻烦',
    '把',
    '改',
    '改成',
    '改一下',
    '调整',
    '完善',
    '补充',
    '替换',
    '执行',
    '修改',
    '更新',
    '删除',
    '清理',
    '撤销',
    '回滚',
    '恢复',
    '取消',
    '重跑',
    '重试',
    '生成',
    '重生成',
    '提交',
    '开始',
    '创建',
    '绑定',
    '应用到',
    'apply',
    'update',
    'delete',
    'regenerate',
    'generate',
    'submit',
    'cancel',
    'rollback',
  ]
  const planHints = [
    '计划',
    '规划',
    '方案',
    '步骤',
    '怎么做',
    '如何做',
    '下一步',
    '先做什么',
    'plan',
    'steps',
    'workflow',
    'approve',
    '审批',
  ]
  const queryHints = [
    '是什么',
    '为什么',
    '解释',
    '查看',
    '列出',
    '有哪些',
    '如何',
    '怎么',
    'what',
    'why',
    'explain',
    'show',
    'list',
  ]

  const reasonCodes: string[] = []

  if (hasAny(text, planHints) || hasAny(lower, planHints)) {
    reasonCodes.push('intent:plan-hint')
  }
  if (hasAny(text, actHints) || hasAny(lower, actHints)) {
    reasonCodes.push('intent:act-hint')
  }
  if (hasAny(text, queryHints) || hasAny(lower, queryHints)) {
    reasonCodes.push('intent:query-hint')
  }

  const automationIsActive = automationMode !== TOOL_PROFILE_MODE.EXPLORE
  if (automationIsActive && (text.includes('能不能') || text.includes('可以'))) {
    if (reasonCodes.includes('intent:act-hint')) {
      reasonCodes.push('intent:auto:request')
      return { intent: 'act', reasonCodes, confidence: 0.7 }
    }
  }

  if (reasonCodes.includes('intent:act-hint') && !reasonCodes.includes('intent:plan-hint')) {
    return { intent: 'act', reasonCodes, confidence: 0.75 }
  }
  if (reasonCodes.includes('intent:plan-hint') && !reasonCodes.includes('intent:act-hint')) {
    return { intent: 'plan', reasonCodes, confidence: 0.75 }
  }
  if (reasonCodes.includes('intent:plan-hint') && reasonCodes.includes('intent:act-hint')) {
    return { intent: 'plan', reasonCodes: [...reasonCodes, 'intent:plan-over-act'], confidence: 0.6 }
  }
  if (reasonCodes.includes('intent:query-hint')) {
    return { intent: 'query', reasonCodes, confidence: 0.6 }
  }
  return { intent: 'query', reasonCodes: ['intent:default->query'], confidence: 0.4 }
}

function detectDomains(latestUserText: string): { domains: ProjectAgentDomain[]; reasonCodes: string[] } {
  const text = latestUserText.trim()
  const lower = text.toLowerCase()
  const domains: ProjectAgentDomain[] = []
  const reasonCodes: string[] = []

  const checks: Array<{ domain: ProjectAgentDomain; patterns: string[]; code: string }> = [
    { domain: 'workflow', patterns: ['workflow', 'story-to-script', 'script-to-storyboard', '审批', '计划', '规划'], code: 'domain:workflow' },
    { domain: 'run', patterns: ['run', '运行', '执行记录', '重跑', '重试', 'cancel_run'], code: 'domain:run' },
    { domain: 'task', patterns: ['task', '任务', '队列', '进度', '状态', '失败'], code: 'domain:task' },
    { domain: 'storyboard', patterns: ['分镜', 'storyboard', '镜头', '摄影计划'], code: 'domain:storyboard' },
    { domain: 'panel', patterns: ['面板', 'panel', '第', '镜', 'shot'], code: 'domain:panel' },
    { domain: 'character', patterns: ['角色', '人物', '人设', '性格', '外观', '服装'], code: 'domain:character' },
    { domain: 'location', patterns: ['场景', '地点', '环境', 'location'], code: 'domain:location' },
    { domain: 'voice', patterns: ['配音', '音色', '台词', 'voice'], code: 'domain:voice' },
    { domain: 'asset-hub', patterns: ['资产库', '全局资产', 'asset hub', 'asset-hub', '素材库'], code: 'domain:asset-hub' },
    { domain: 'config', patterns: ['配置', '模型', 'api key', 'apikey', 'baseurl', 'provider'], code: 'domain:config' },
    { domain: 'billing', patterns: ['费用', '成本', '计费', '额度', '账单', 'billing'], code: 'domain:billing' },
    { domain: 'governance', patterns: ['回滚', '撤销', '恢复', 'mutation', '批处理', '清理'], code: 'domain:governance' },
    { domain: 'download', patterns: ['下载', '导出', 'export', 'download'], code: 'domain:download' },
    { domain: 'media', patterns: ['图片', '视频', '生成', '重生成', '上传', 'media'], code: 'domain:media' },
    { domain: 'debug', patterns: ['debug', '诊断', 'trace'], code: 'domain:debug' },
  ]

  for (const check of checks) {
    if (hasAny(text, check.patterns) || hasAny(lower, check.patterns)) {
      domains.push(check.domain)
      reasonCodes.push(check.code)
    }
  }

  if (domains.length === 0) {
    return { domains: ['unknown'], reasonCodes: ['domain:unknown'] }
  }
  return { domains, reasonCodes }
}

function decideNodeId(params: {
  intent: ProjectAgentIntent
  domains: ProjectAgentDomain[]
  phase: ProjectPhaseSnapshot
  context: ProjectAgentContext
}): { nodeId: ProjectAgentNodeId; reasonCodes: string[] } {
  const reasons: string[] = []
  const domains = new Set(params.domains)
  const hasEpisode = Boolean(params.context.episodeId)

  if (domains.has('debug')) return { nodeId: 'debug_tools', reasonCodes: ['node:debug'] }
  if (domains.has('governance')) return { nodeId: 'governance_recovery', reasonCodes: ['node:governance'] }
  if (domains.has('billing')) return { nodeId: 'billing_costs', reasonCodes: ['node:billing'] }
  if (domains.has('config')) return { nodeId: 'config_models', reasonCodes: ['node:config'] }
  if (domains.has('download')) return { nodeId: 'downloads_exports', reasonCodes: ['node:download'] }
  if (domains.has('workflow')) {
    return {
      nodeId: params.intent === 'plan' ? 'workflow_plan' : 'workflow_run',
      reasonCodes: [`node:workflow:${params.intent}`],
    }
  }
  if (domains.has('run')) return { nodeId: 'run_manage', reasonCodes: ['node:run'] }
  if (domains.has('task')) return { nodeId: 'task_manage', reasonCodes: ['node:task'] }
  if (domains.has('asset-hub')) return { nodeId: 'asset_hub_read', reasonCodes: ['node:asset-hub'] }

  const isStoryboardDomain = domains.has('storyboard') || domains.has('panel')
  const isAssetDomain = domains.has('character') || domains.has('location') || domains.has('voice')

  // Query about assets should prefer asset nodes even if storyboard terms are mentioned.
  if (params.intent === 'query' && isAssetDomain) {
    return {
      nodeId: 'project_assets_read',
      reasonCodes: ['node:assets:query'],
    }
  }

  // Act requests that mention storyboard/panels should prefer storyboard edit nodes.
  if (params.intent === 'act' && isStoryboardDomain) {
    if (params.domains.includes('media') && params.intent === 'act' && hasEpisode && params.phase.availableActions.actMode.length > 0) {
      return { nodeId: 'panel_media_generate', reasonCodes: ['node:panel-media:phase-action'] }
    }
    return {
      nodeId: params.intent === 'act' ? 'storyboard_edit' : 'storyboard_read',
      reasonCodes: [`node:storyboard:${params.intent}`],
    }
  }

  if (isAssetDomain) {
    return {
      nodeId: params.intent === 'act' ? 'project_assets_edit' : 'project_assets_read',
      reasonCodes: [`node:assets:${params.intent}`],
    }
  }

  if (isStoryboardDomain) {
    return {
      nodeId: params.intent === 'act' ? 'storyboard_edit' : 'storyboard_read',
      reasonCodes: [`node:storyboard:${params.intent}`],
    }
  }

  if (!hasEpisode) reasons.push('node:prior:no-episode')
  else reasons.push('node:prior:has-episode')
  return { nodeId: 'project_overview', reasonCodes: reasons }
}

export function routeProjectAgentRequest(input: {
  messages: UIMessage[]
  phase: ProjectPhaseSnapshot
  context: ProjectAgentContext
}): ProjectAgentRouteDecision {
  const latestUserText = extractLatestUserText(input.messages)
  const profileMode = input.context.toolSelection?.profile?.mode ?? TOOL_PROFILE_MODE.EXPLORE
  const intentResult = detectIntent(latestUserText, profileMode)
  const domainResult = detectDomains(latestUserText)
  const nodeResult = decideNodeId({
    intent: intentResult.intent,
    domains: domainResult.domains,
    phase: input.phase,
    context: input.context,
  })

  const reasonCodes = [
    ...intentResult.reasonCodes,
    ...domainResult.reasonCodes,
    ...nodeResult.reasonCodes,
  ]

  const confidence = Math.max(0, Math.min(1, Math.round(intentResult.confidence * 100) / 100))

  return {
    nodeId: nodeResult.nodeId,
    intent: intentResult.intent,
    domains: domainResult.domains,
    confidence,
    reasonCodes,
    latestUserText,
  }
}
