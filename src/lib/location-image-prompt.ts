import { parseLocationAvailableSlots } from '@/lib/location-available-slots'

type Locale = 'zh' | 'en'

export function buildLocationImagePromptCore(params: {
  description: string
  availableSlotsRaw?: string | null
  locale: Locale
}): string {
  const promptBody = params.description.trim()
  const slots = parseLocationAvailableSlots(params.availableSlotsRaw)

  const fidelityConstraints = params.locale === 'en'
    ? 'Treat the scene description as authoritative. Preserve the core scene identity, visible objects, materials, era cues, and spatial relationships; do not replace it with a different scene category.'
    : '必须以场景描述为最高优先级，保留核心场景身份、可见物体、材质、时代感和空间关系，不要替换成其他场景类型。'

  const spatialConstraints = params.locale === 'en'
    ? 'Use a wide, complete environment composition that clearly shows the main structure, foreground/midground/background, and visible spatial boundaries. Do not generate a generic partial background, cropped anchor, or ambiguous layout.'
    : '必须使用宽广完整的场景全景构图，清楚展示主要结构、前景/中景/背景和空间边界。禁止生成局部裁切、锚点缺失、空间关系模糊的泛化背景。'

  const noMarkConstraints = params.locale === 'en'
    ? 'Do not add non-diegetic overlays such as subtitles, captions, explanatory text, watermarks, annotation labels, arrows, guide lines, marking lines, outline placeholders, UI markers, map labels, or floor-plan/blueprint graphics. Natural in-world text on plausible scene objects such as shop signs, street signs, door numbers, posters, packaging, or screens is allowed only when it belongs to the described environment; keep it secondary and do not turn it into random gibberish or intrusive floating text.'
    : '不要添加非场景内的叠加元素，例如字幕、说明文字、水印、注释标签、箭头、引导线、标注线、轮廓占位、UI标记、地图标签、平面图或蓝图式图形。场景世界里自然存在的文字可以保留，例如招牌、路标、门牌、海报、包装、屏幕文字，但必须属于当前环境，保持次要且自然，不要变成随机乱码或突兀漂浮文字。'

  if (slots.length === 0) {
    return `${promptBody}\n\n${fidelityConstraints}\n${spatialConstraints}\n${noMarkConstraints}`.trim()
  }

  const naturalSlotConstraints = params.locale === 'en'
    ? `For later character compositing, naturally keep the anchor objects and nearby open floor/space for these placement areas visible in the environment: ${slots.join('; ')}. Treat them as invisible layout guidance only; do not draw labels, outlines, boxes, arrows, guide marks, or artificial placeholders for these areas.`
    : `为了后续角色合成，请在环境构图中自然保留这些落位区域对应的锚物和周边空白：${slots.join('；')}。这些内容只作为不可见的布局指导，不要为这些区域画出文字标签、轮廓框、箭头、引导线、标记或人工占位图形。`

  return `${promptBody}\n\n${fidelityConstraints}\n${spatialConstraints}\n${naturalSlotConstraints}\n${noMarkConstraints}`.trim()
}
