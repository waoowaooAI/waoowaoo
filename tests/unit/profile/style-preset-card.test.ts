import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import {
  StylePresetCard,
  splitStylePresetKindSections,
  type StylePresetListItem,
} from '@/app/[locale]/profile/components/StylePresetsTab'
import { buildDirectorStyleDoc } from '@/lib/director-style/presets'
import { buildPromptOnlyVisualStyleConfig } from '@/lib/style-preset/visual-config'

const messages = {
  profile: {
    stylePresets: {
      noSummary: '暂无简介',
      editTitle: '编辑风格',
      delete: '删除',
      sectionCount: '{count} 个',
      kind: {
        visual_style: '画风',
        director_style: '导演风格',
      },
      source: {
        system: '系统内置',
        user: '我的创建',
      },
    },
  },
} as const

function renderWithIntl(node: ReactElement): string {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps))
}

function renderCard(preset: StylePresetListItem): string {
  Reflect.set(globalThis, 'React', React)
  return renderWithIntl(
    createElement(StylePresetCard, {
      preset,
      onOpen: vi.fn(),
      onDelete: vi.fn(async () => undefined),
    }),
  )
}

describe('StylePresetCard', () => {
  it('renders style kind and source inside the card', () => {
    const html = renderCard({
      source: 'system',
      id: 'anime',
      kind: 'visual_style',
      name: '日系动漫风',
      summary: '清晰干净的线条',
      config: buildPromptOnlyVisualStyleConfig('清晰干净的线条'),
    })

    expect(html).toContain('画风')
    expect(html).toContain('系统内置')
    expect(html).not.toContain('glass-chip')
    expect(html).not.toContain('aria-label="删除"')
  })

  it('only exposes delete action for user-created presets', () => {
    const html = renderCard({
      source: 'user',
      id: 'user-style-1',
      kind: 'visual_style',
      name: '我的风格',
      summary: null,
      config: buildPromptOnlyVisualStyleConfig('提示词'),
    })

    expect(html).toContain('我的创建')
    expect(html).toContain('aria-label="删除"')
  })

  it('splits styles into visual and director sections', () => {
    const visualPreset: StylePresetListItem = {
      source: 'user',
      id: 'user-style-1',
      kind: 'visual_style',
      name: '我的风格',
      summary: null,
      config: buildPromptOnlyVisualStyleConfig('提示词'),
    }
    const directorPreset: StylePresetListItem = {
      source: 'system',
      id: 'director-style-1',
      kind: 'director_style',
      name: '导演风格',
      summary: '镜头要求',
      config: buildDirectorStyleDoc('horror-suspense'),
    }

    expect(splitStylePresetKindSections([directorPreset, visualPreset])).toEqual({
      visual_style: [visualPreset],
      director_style: [directorPreset],
    })
  })
})
