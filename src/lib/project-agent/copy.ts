import type { ProjectAgentLocale } from './locale'

const SELECTABLE_TOOL_DESCRIPTION_COPY: Record<string, { zh: string; en: string }> = {
  asset_hub_list_folders: {
    zh: '列出当前用户的全局资产文件夹。',
    en: 'List global asset folders for the current user.',
  },
  asset_hub_picker: {
    zh: '列出可供选择器使用的全局资产（角色/场景/音色），并返回预览链接。',
    en: 'List global assets for picker use (character/location/voice) with preview URLs.',
  },
  asset_hub_list_characters: {
    zh: '列出当前用户的全局角色，可按 folderId 过滤。',
    en: 'List global characters for the current user, optionally filtered by folderId.',
  },
  asset_hub_get_character: {
    zh: '按 id 获取单个全局角色。',
    en: 'Get a single global character by id.',
  },
  asset_hub_list_locations: {
    zh: '列出当前用户的全局场景，可按 folderId 过滤。',
    en: 'List global locations for the current user, optionally filtered by folderId.',
  },
  asset_hub_get_location: {
    zh: '按 id 获取单个全局场景。',
    en: 'Get a global location by id.',
  },
  asset_hub_list_voices: {
    zh: '列出当前用户的全局音色，可按 folderId 过滤。',
    en: 'List global voices for the current user, optionally filtered by folderId.',
  },
  asset_hub_get_voice: {
    zh: '按 id 获取单个全局音色。',
    en: 'Get a global voice by id.',
  },
}

export function localizeSelectableToolDescription(
  operationId: string,
  fallback: string,
  locale: ProjectAgentLocale,
): string {
  const copy = SELECTABLE_TOOL_DESCRIPTION_COPY[operationId]
  if (!copy) return fallback
  return copy[locale]
}

export function buildProjectAgentSystemPrompt(params: {
  locale: ProjectAgentLocale
  projectId: string
  episodeId: string
  stage: string
  phaseSummary: string
  toolSummary: string
}): string {
  if (params.locale === 'en') {
    return [
      'You are the project-level AI agent for the novel promotion workspace.',
      'Your job is explanation, planning, approval-driven execution, and status reporting. Do not freely rewrite the fixed workflow package order.',
      'For story-to-script and script-to-storyboard, you must execute through the fixed workflow package only.',
      'The skill order inside a workflow package cannot be changed, skipped, or merged.',
      'When the user wants either main workflow: call create_workflow_plan first, then wait for approval; only call approve_plan after explicit user approval.',
      'In the assistant chat entry: low-risk small actions may act directly; medium/high-risk, billable, destructive, overwrite, bulk, or long-running actions must ask for explicit confirmation first by sending confirmed=true in the tool input.',
      'Important: every tool returns a wrapped result. Success: { ok: true, data: ... }. Failure: { ok: false, error: { code, message, operationId, details?, issues? }, confirmationRequired? }.',
      'When a tool returns ok=false: read error.code and error.message before deciding the next step.',
      'When confirmationRequired=true: explain the side effects, ask for confirmation, and call the same tool again with confirmed=true after the user approves.',
      'When you see staleArtifacts or failedItems: explain the reason first and recommend the next action.',
      'You may only use the tools injected into the current turn. Tool availability is dynamically trimmed by intent and stage.',
      'The router has already selected tool categories. Do not assume missing tools exist.',
      'Answer concisely in English.',
      `projectId=${params.projectId}`,
      `episodeId=${params.episodeId}`,
      `currentStage=${params.stage}`,
      `projectPhase=${params.phaseSummary}`,
      `toolRouting=${params.toolSummary}`,
    ].join('\n')
  }

  return [
    '你是 novel promotion workspace 的项目级 AI agent。',
    '你的职责是解释、规划、审批驱动和状态汇报，不要自由改写固定 workflow package 的内部顺序。',
    '对于 story-to-script 和 script-to-storyboard，只能通过固定 workflow package 执行。',
    'workflow package 内部 skills 顺序不可更改、不可跳过、不可合并。',
    '当用户要求执行这两条主流程时：先调用 create_workflow_plan，再等待审批；只有用户明确同意后才调用 approve_plan。',
    '在 assistant 对话入口：低风险小操作可直接 act；中/高风险、计费、或 destructive/overwrite/bulk/longRunning 操作必须先征得用户明确确认后再执行（tool 参数中带 confirmed=true）。',
    '重要：所有 tool 返回统一包裹结构：成功为 { ok: true, data: ... }；失败为 { ok: false, error: { code, message, operationId, details?, issues? }, confirmationRequired? }。',
    '当 tool 返回 ok=false：你必须读取 error.code 与 error.message 来决定下一步（例如补参数、先查询再重试、或向用户提问）。',
    '当 tool 返回 confirmationRequired=true：你应向用户解释副作用原因并请求确认，然后在下一次调用同一 tool 时传入 confirmed=true（可参考 confirmation 卡片中的 argsHint）。',
    '当你看到 staleArtifacts 或 failedItems：优先解释原因与推荐动作（例如重跑 workflow、或执行更小粒度的 act 修复）。',
    '你只能使用当前会话注入的 tools 来完成任务（会根据用户意图与阶段动态裁剪）。tool 定义中已包含使用说明，无需额外列举。',
    'router 已经先行选择了工具类别，不要假设未注入的工具存在。',
    '回答简洁，用中文。',
    `projectId=${params.projectId}`,
    `episodeId=${params.episodeId}`,
    `currentStage=${params.stage}`,
    `projectPhase=${params.phaseSummary}`,
    `toolRouting=${params.toolSummary}`,
  ].join('\n')
}

export function buildCompressionPrompt(locale: ProjectAgentLocale, transcript: string): {
  system: string
  prompt: string
} {
  if (locale === 'en') {
    return {
      system: [
        'Summarize an older assistant conversation for continued execution.',
        'Keep concrete facts only: user goals, confirmed decisions, pending approvals, created ids, errors, unfinished work, and constraints.',
        'Do not invent facts. Do not omit destructive or billable decisions.',
        'Return plain text with short bullet lines.',
      ].join('\n'),
      prompt: `Summarize the following earlier conversation for future turns:\n\n${transcript}`,
    }
  }

  return {
    system: [
      '请把较早的 assistant 对话压缩成后续可继续执行的摘要。',
      '只保留具体事实：用户目标、已确认决策、待审批事项、已创建的 id、错误、未完成工作、关键约束。',
      '禁止编造事实，禁止省略 destructive 或 billable 决策。',
      '返回纯文本，用简短项目符号。',
    ].join('\n'),
    prompt: `请总结下面这段较早的对话，供后续轮次继续使用：\n\n${transcript}`,
  }
}

export function buildSummaryText(locale: ProjectAgentLocale, summary: string): string {
  return locale === 'en'
    ? `Conversation summary for earlier turns:\n${summary.trim()}`
    : `早期对话摘要：\n${summary.trim()}`
}
