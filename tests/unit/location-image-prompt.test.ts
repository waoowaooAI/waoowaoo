import { describe, expect, it } from 'vitest'
import { buildLocationImagePromptCore } from '@/lib/location-image-prompt'

describe('buildLocationImagePromptCore', () => {
  it('uses natural invisible layout guidance for available slots in zh prompts', () => {
    const prompt = buildLocationImagePromptCore({
      description: '「雨夜街道」湿润石板路延伸到远处，路灯照亮墙面。',
      availableSlotsRaw: JSON.stringify([
        '街道左侧靠墙的留白位置',
        '路灯下方靠近门廊的位置',
      ]),
      locale: 'zh',
    })

    expect(prompt).toContain('自然保留这些落位区域对应的锚物和周边空白')
    expect(prompt).toContain('街道左侧靠墙的留白位置')
    expect(prompt).toContain('路灯下方靠近门廊的位置')
    expect(prompt).toContain('不要为这些区域画出文字标签、轮廓框、箭头、引导线、标记或人工占位图形')
    expect(prompt).toContain('不要添加非场景内的叠加元素')
    expect(prompt).toContain('场景世界里自然存在的文字可以保留')
    expect(prompt).toContain('招牌、路标、门牌')
    expect(prompt).not.toContain('可站位置：')
    expect(prompt).not.toContain('固定人物位置')
  })

  it('uses natural invisible layout guidance for available slots in en prompts', () => {
    const prompt = buildLocationImagePromptCore({
      description: '[Rainy Street] Wet stone pavement extends into the distance under street lamps.',
      availableSlotsRaw: JSON.stringify([
        'the open space beside the left wall',
        'the position near the doorway under the lamp',
      ]),
      locale: 'en',
    })

    expect(prompt).toContain('naturally keep the anchor objects and nearby open floor/space')
    expect(prompt).toContain('the open space beside the left wall')
    expect(prompt).toContain('do not draw labels, outlines, boxes, arrows, guide marks, or artificial placeholders')
    expect(prompt).toContain('Do not add non-diegetic overlays')
    expect(prompt).toContain('Natural in-world text on plausible scene objects')
    expect(prompt).toContain('shop signs, street signs, door numbers')
    expect(prompt).not.toContain('Available character slots:')
    expect(prompt).not.toContain('fixed character positions')
  })
})
