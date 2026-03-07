import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { LocationCreationModal } from '@/components/shared/assets/LocationCreationModal'

vi.mock('@/lib/query/hooks', () => ({
  useAiCreateProjectLocation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useAiDesignLocation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useCreateAssetHubLocation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useGenerateLocationImage: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useCreateProjectLocation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useGenerateProjectLocationImage: vi.fn(() => ({ mutateAsync: vi.fn() })),
}))

const messages = {
  assetModal: {
    location: {
      title: '新建场景',
      name: '场景名称',
      namePlaceholder: '请输入场景名称',
      description: '场景描述',
      descPlaceholder: '请输入场景描述...',
    },
    artStyle: { title: '画面风格' },
    aiDesign: {
      title: 'AI 设计',
      placeholderLocation: '描述场景氛围和环境...',
      generating: '设计中...',
      generate: '生成',
      tip: '输入简单描述，AI 帮你生成详细设定',
    },
    common: {
      cancel: '取消',
      addOnlyLocation: '仅添加场景',
      addOnlyToAssetHubLocation: '仅添加场景到资产库',
      addAndGeneratePrefix: '添加并生成',
      generateCountSuffix: '张图片',
      selectGenerateCount: '选择生成数量',
      optional: '（可选）',
    },
    errors: {
      createFailed: '创建失败',
      aiDesignFailed: 'AI 设计失败',
      insufficientBalance: '账户余额不足',
    },
  },
} as const

const renderWithIntl = (node: ReactElement) => {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps),
  )
}

describe('LocationCreationModal', () => {
  it('renders add-only and add-and-generate actions in the fixed footer', () => {
    Reflect.set(globalThis, 'React', React)
    const html = renderWithIntl(
      createElement(LocationCreationModal, {
        mode: 'asset-hub',
        onClose: () => undefined,
        onSuccess: () => undefined,
      }),
    )

    expect(html).toContain('仅添加场景到资产库')
    expect(html).toContain('添加并生成')
    expect(html).toContain('取消')
  })
})
