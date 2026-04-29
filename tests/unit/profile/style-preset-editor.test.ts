import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import StylePresetEditor from '@/app/[locale]/profile/components/StylePresetEditor'
import { buildDraft } from '@/app/[locale]/profile/components/stylePresetEditorState'

const messages = {
  profile: {
    stylePresets: {
      fields: {
        name: '名称',
        summary: '简介',
        instruction: '设计需求',
        prompt: '提示词',
      },
      kind: {
        visual_style: '画风',
        director_style: '导演风格',
      },
      kindDescription: {
        visual_style: '控制图片和视觉生成的画面语言',
        director_style: '控制角色、分镜、摄影和视频的导演要求',
      },
      directorConfigDetails: '导演风格配置',
      design: 'AI 设计',
      designing: '设计中',
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

describe('StylePresetEditor', () => {
  it('keeps visual style creation to name and prompt fields', () => {
    Reflect.set(globalThis, 'React', React)
    const draft = buildDraft('visual_style')

    const html = renderWithIntl(
      createElement(StylePresetEditor, {
        draft,
        error: null,
        designing: false,
        readOnly: false,
        onKindChange: vi.fn(),
        onNameChange: vi.fn(),
        onInstructionChange: vi.fn(),
        onDesign: vi.fn(),
        onVisualConfigChange: vi.fn(),
      }),
    )

    expect(html).toContain('名称')
    expect(html).toContain('提示词')
    expect(html).toContain('rounded-xl p-[3px] bg-[#e8e8ed]')
    expect(html).not.toContain('简介')
    expect(html).not.toContain('设计需求')
  })

  it('keeps director style creation on AI design with folded config details', () => {
    Reflect.set(globalThis, 'React', React)
    const draft = buildDraft('director_style')

    const html = renderWithIntl(
      createElement(StylePresetEditor, {
        draft,
        error: null,
        designing: false,
        readOnly: false,
        onKindChange: vi.fn(),
        onNameChange: vi.fn(),
        onInstructionChange: vi.fn(),
        onDesign: vi.fn(),
        onVisualConfigChange: vi.fn(),
      }),
    )

    expect(html).toContain('名称')
    expect(html).toContain('设计需求')
    expect(html).toContain('AI 设计')
    expect(html).toContain('导演风格配置')
    expect(html).not.toContain('&quot;character&quot;')
  })
})
