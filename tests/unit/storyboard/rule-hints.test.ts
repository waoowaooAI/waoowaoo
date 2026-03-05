import { describe, expect, it } from 'vitest'
import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'
import { evaluateStoryboardRuleHints } from '@/features/storyboard/rule-hints'

function buildPanel(overrides: Partial<PanelEditData> = {}): PanelEditData {
  return {
    id: 'panel-1',
    panelIndex: 0,
    panelNumber: 1,
    shotType: 'close-up',
    cameraMove: 'push-in',
    description: '主角抬眼，缓缓走向门口。',
    location: '走廊',
    characters: [{ name: '主角', appearance: '默认' }],
    srtStart: null,
    srtEnd: null,
    duration: 5,
    videoPrompt: '电影感，强对比',
    sourceText: null,
    ...overrides,
  }
}

describe('storyboard rule hints', () => {
  it('描述字数过短时应触发字数警告', () => {
    const hints = evaluateStoryboardRuleHints(buildPanel({ description: '看向前方。' }))
    expect(hints.some((hint) => hint.id === 'word-count-too-short')).toBe(true)
  })

  it('镜头时长过长时应触发节奏警告', () => {
    const hints = evaluateStoryboardRuleHints(buildPanel({ duration: 12 }))
    expect(hints.some((hint) => hint.id === 'pace-too-slow')).toBe(true)
  })

  it('缺少钩子词时应触发钩子提示', () => {
    const hints = evaluateStoryboardRuleHints(buildPanel({
      description: '主角走进会议室，坐下后开始陈述计划细节，镜头平稳推进。',
      videoPrompt: '稳定运镜，偏写实',
    }))
    expect(hints.some((hint) => hint.id === 'missing-hook')).toBe(true)
  })

  it('包含钩子词时不应触发缺钩子提示', () => {
    const hints = evaluateStoryboardRuleHints(buildPanel({
      description: '主角刚要签字却突然停住，反转揭晓真相。',
      videoPrompt: '冲突强化',
    }))
    expect(hints.some((hint) => hint.id === 'missing-hook')).toBe(false)
  })
})
