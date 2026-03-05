import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'

export type StoryRuleHintLevel = 'info' | 'warning'

export interface StoryRuleHint {
  id: string
  level: StoryRuleHintLevel
  title: string
  message: string
  action: string
}

const HOOK_KEYWORDS = [
  '反转',
  '爆点',
  '冲突',
  '悬念',
  '突然',
  '危机',
  '翻盘',
  '揭晓',
  '真相',
  '绝境',
  '却',
  '但',
]

function compactText(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, '')
}

function hasHookKeyword(text: string) {
  return HOOK_KEYWORDS.some((keyword) => text.includes(keyword))
}

export function evaluateStoryboardRuleHints(panelData: PanelEditData): StoryRuleHint[] {
  const hints: StoryRuleHint[] = []

  const descriptionText = compactText(panelData.description)
  const videoPromptText = compactText(panelData.videoPrompt)
  const combinedText = `${descriptionText}${videoPromptText}`
  const descriptionChars = Array.from(descriptionText).length

  if (descriptionChars > 0 && descriptionChars < 24) {
    hints.push({
      id: 'word-count-too-short',
      level: 'warning',
      title: '字数偏少',
      message: `当前场景描述仅 ${descriptionChars} 字，信息密度不足。`,
      action: '建议补充动作、情绪和关键冲突，目标 24-180 字。',
    })
  }

  if (descriptionChars > 180) {
    hints.push({
      id: 'word-count-too-long',
      level: 'warning',
      title: '字数偏多',
      message: `当前场景描述 ${descriptionChars} 字，可能拖慢节奏。`,
      action: '建议拆分成多个镜头动作点，保留单镜头最关键信息。',
    })
  }

  const durationSec = panelData.duration
  if (typeof durationSec === 'number' && durationSec > 8) {
    hints.push({
      id: 'pace-too-slow',
      level: 'warning',
      title: '节奏偏慢',
      message: `镜头时长 ${durationSec}s，超出短剧常用快节奏区间。`,
      action: '建议缩短到 2-8s，或拆分为连续两个镜头。',
    })
  }

  if (descriptionChars >= 24 && !hasHookKeyword(combinedText)) {
    hints.push({
      id: 'missing-hook',
      level: 'info',
      title: '钩子信号偏弱',
      message: '描述中未检测到明显冲突/反转/悬念词。',
      action: '可加入“反转、危机、真相、突然”等钩子词强化记忆点。',
    })
  }

  return hints
}
