import * as React from 'react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'

describe('ImageGenerationInlineCountButton', () => {
  it('keeps the select enabled when only the action is disabled', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(ImageGenerationInlineCountButton, {
        prefix: createElement('span', null, '生成'),
        suffix: createElement('span', null, '张图片'),
        value: 3,
        options: [1, 2, 3],
        onValueChange: () => undefined,
        onClick: () => undefined,
        actionDisabled: true,
        selectDisabled: false,
        ariaLabel: '选择生成数量',
      }),
    )

    expect(html).toContain('role="button"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain('<select disabled=""')
    expect(html).toContain('rounded-full border-white/20 bg-white/10')
    expect(html).toContain('inline-flex shrink-0 items-center whitespace-nowrap leading-none')
  })

  it('renders the count control as a rounded inline pill with the chevron inside it', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(ImageGenerationInlineCountButton, {
        prefix: createElement('span', null, '重新生成'),
        suffix: createElement('span', null, '张'),
        value: 2,
        options: [1, 2, 3],
        onValueChange: () => undefined,
        onClick: () => undefined,
        ariaLabel: '选择重新生成数量',
      }),
    )

    expect(html).toContain('重新生成')
    expect(html).toContain('张')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('rounded-full border-white/20 bg-white/10')
  })

  it('can render a regenerate action without exposing the count selector', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(ImageGenerationInlineCountButton, {
        prefix: createElement('span', null, '重新生成'),
        suffix: null,
        value: 2,
        options: [1, 2, 3],
        onValueChange: () => undefined,
        onClick: () => undefined,
        showCountControl: false,
        ariaLabel: '重新生成当前图片',
        className: 'inline-flex h-6 items-center justify-center rounded-md px-1.5',
      }),
    )

    expect(html).toContain('重新生成')
    expect(html).toContain('type="button"')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('rounded-full bg-white/12')
  })
})
