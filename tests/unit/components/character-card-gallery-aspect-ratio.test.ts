import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'

vi.mock('@/components/ui/icons', () => ({
  AppIcon: () => createElement('span', null),
}))

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  default: () => createElement('div', null, 'overlay'),
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: (props: { containerClassName?: string; className?: string }) =>
    createElement('div', { className: [props.containerClassName, props.className].filter(Boolean).join(' ') }),
}))

const messages = {
  assets: {
    common: {
      generateFailed: '生成失败',
    },
    image: {
      optionNumber: '方案 {number}',
    },
  },
} as const

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: AbstractIntlMessages
  timeZone: string
  children?: React.ReactNode
}>

describe('CharacterCardGallery natural image sizing', () => {
  it('renders the single-image slot without a fixed aspect ratio', async () => {
    Reflect.set(globalThis, 'React', React)
    const { default: CharacterCardGallery } = await import('@/features/project-workspace/components/assets/character-card/CharacterCardGallery')

    const html = renderToStaticMarkup(
      createElement(
        TestIntlProvider,
        {
          locale: 'zh',
          messages: messages as unknown as AbstractIntlMessages,
          timeZone: 'Asia/Shanghai',
        },
        createElement(CharacterCardGallery, {
          mode: 'single',
          characterName: '沈烬',
          changeReason: '默认形象',
          currentImageUrl: null,
          selectedIndex: null,
          hasMultipleImages: false,
          isAppearanceTaskRunning: true,
          displayTaskPresentation: null,
          onImageClick: () => undefined,
          overlayActions: null,
        }),
      ),
    )

    expect(html).not.toContain('aspect-[3/2]')
    expect(html).toContain('min-h-[120px]')
  })
})
