import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { CharacterCreationModal } from '@/components/shared/assets/CharacterCreationModal'

vi.mock('@/lib/query/hooks', () => ({
  useProjectAssets: vi.fn(() => ({ data: { characters: [] } })),
}))

vi.mock('@/components/shared/assets/character-creation/hooks/useCharacterCreationSubmit', () => ({
  useCharacterCreationSubmit: vi.fn(() => ({
    isSubmitting: false,
    isAiDesigning: false,
    isExtracting: false,
    characterGenerationCount: 3,
    setCharacterGenerationCount: vi.fn(),
    referenceCharacterGenerationCount: 3,
    setReferenceCharacterGenerationCount: vi.fn(),
    handleExtractDescription: vi.fn(),
    handleCreateWithReference: vi.fn(),
    handleAiDesign: vi.fn(),
    handleSubmit: vi.fn(),
    handleSubmitAndGenerate: vi.fn(),
  })),
}))

const messages = {
  assetModal: {
    character: {
      title: '新建角色',
      name: '角色名称',
      namePlaceholder: '请输入角色名称',
      modeReference: '参考图模式',
      modeDescription: '描述模式',
      uploadReference: '上传参考图',
      pasteHint: 'Ctrl+V 粘贴',
      generationMode: '生成方式',
      directGenerate: '直接生成',
      extractPrompt: '反推提示词',
      extractFirst: '先提取描述',
      description: '角色描述',
      descPlaceholder: '请输入角色外貌描述...',
      isSubAppearance: '这是一个子形象',
      isSubAppearanceHint: '为已有角色添加新的形象状态',
      selectMainCharacter: '选择主角色',
      selectCharacterPlaceholder: '请选择角色...',
      appearancesCount: '{count} 个形象',
      changeReason: '形象变化原因',
      changeReasonPlaceholder: '例如',
      useReferenceGeneratePrefix: '使用参考图生成',
      generateCountSuffix: '张图片',
      selectReferenceGenerateCount: '选择参考图生成数量',
    },
    artStyle: { title: '画面风格' },
    aiDesign: {
      title: 'AI 设计',
      placeholder: '描述你想要的角色特征...',
      generating: '设计中...',
      generate: '生成',
    },
    common: {
      creating: '创建中...',
      cancel: '取消',
      adding: '添加中...',
      add: '添加',
      addOnly: '仅添加角色',
      addOnlyToAssetHub: '仅添加人物到资产库',
      addAndGeneratePrefix: '添加并生成',
      generateCountSuffix: '张图片',
      selectGenerateCount: '选择生成数量',
      optional: '（可选）',
    },
    errors: {
      uploadFailed: '上传失败',
      extractDescriptionFailed: '提取描述失败',
      createFailed: '创建失败',
      aiDesignFailed: 'AI 设计失败',
      addSubAppearanceFailed: '添加子形象失败',
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

describe('CharacterCreationModal', () => {
  it('renders add-only and add-and-generate actions in the fixed footer', () => {
    Reflect.set(globalThis, 'React', React)
    const html = renderWithIntl(
      createElement(CharacterCreationModal, {
        mode: 'asset-hub',
        onClose: () => undefined,
        onSuccess: () => undefined,
      }),
    )

    expect(html).toContain('仅添加人物到资产库')
    expect(html).toContain('添加并生成')
    expect(html).toContain('取消')
  })
})
