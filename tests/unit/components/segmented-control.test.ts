import * as React from 'react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  buildSegmentedControlOptionValuesSignature,
  resolveSegmentedControlIndicator,
  SegmentedControl,
  type SegmentedControlIndicator,
} from '@/components/ui/SegmentedControl'

describe('SegmentedControl', () => {
  it('does not create a new indicator state when the active segment metrics are unchanged', () => {
    const previousIndicator: SegmentedControlIndicator = { left: 24, width: 88 }

    const nextIndicator = resolveSegmentedControlIndicator(previousIndicator, {
      left: 24,
      width: 88,
    })

    expect(nextIndicator).toBe(previousIndicator)
  })

  it('builds the same option signature when labels are recreated with the same values', () => {
    const firstSignature = buildSegmentedControlOptionValuesSignature([
      { value: 'llm', label: createElement('span', null, '文本') },
      { value: 'image', label: createElement('span', null, '图片') },
    ])
    const secondSignature = buildSegmentedControlOptionValuesSignature([
      { value: 'llm', label: createElement('strong', null, '文本') },
      { value: 'image', label: createElement('strong', null, '图片') },
    ])

    expect(firstSignature).toBe('llm|image')
    expect(secondSignature).toBe(firstSignature)
  })

  it('compact 布局 -> 输出左对齐的非拉伸结构', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(SegmentedControl, {
        options: [
          { value: 'all', label: '全部 (24)' },
          { value: 'character', label: '角色 (11)' },
          { value: 'location', label: '场景 (13)' },
          { value: 'prop', label: '道具 (0)' },
        ],
        value: 'all',
        onChange: () => undefined,
        layout: 'compact',
      }),
    )

    expect(html).toContain('inline-block max-w-full')
    expect(html).toContain('inline-grid grid-flow-col auto-cols-[minmax(96px,max-content)]')
    expect(html).not.toContain('grid-template-columns:repeat(4,minmax(0,1fr))')
  })
})
