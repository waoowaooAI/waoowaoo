import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'

vi.mock('@/lib/query/mutations', () => ({
  useUploadProjectCharacterImage: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  __esModule: true,
  default: () => createElement('span', null, 'task-status'),
}))

vi.mock('@/components/image-generation/ImageGenerationInlineCountButton', () => ({
  __esModule: true,
  default: (props: { ariaLabel?: string }) => createElement('button', { 'aria-label': props.ariaLabel }, 'count'),
}))

vi.mock('@/lib/task/presentation', () => ({
  resolveTaskPresentationState: () => null,
}))

vi.mock('@/lib/image-generation/use-image-generation-count', () => ({
  useImageGenerationCount: () => ({
    count: 1,
    setCount: vi.fn(),
  }),
}))

vi.mock('@/lib/image-generation/count', () => ({
  getImageGenerationCountOptions: () => [{ value: 1, label: '1' }],
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: (props: { src?: string; alt?: string }) =>
    createElement('img', { src: props.src, alt: props.alt }),
}))

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  __esModule: true,
  default: () => createElement('div', null, 'overlay'),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: (props: { className?: string; name?: string }) =>
    createElement('span', { className: props.className, 'data-icon': props.name }),
}))

vi.mock('@/components/ui/icons/AISparklesIcon', () => ({
  __esModule: true,
  default: (props: { className?: string }) => createElement('span', { className: props.className }),
}))

vi.mock('@/features/project-workspace/components/assets/VoiceSettings', () => ({
  __esModule: true,
  default: () => createElement('div', null, 'voice-settings'),
}))

const messages = {
  assets: {
    image: {
      regenCountPrefix: '重生成',
      undo: '撤回',
      upload: '上传',
      uploadReplace: '替换',
      edit: '编辑',
      deleteThis: '删除此子形象',
      optionNumber: '方案 {number}',
      optionSelected: '已选择方案 {number}',
      selectFirst: '请选择方案',
      cancelSelection: '取消选择',
      useThis: '使用此图',
      selectTip: '请选择一个方案',
      confirmOption: '确认方案 {number}',
    },
    character: {
      delete: '删除角色',
      deleteOptions: '删除选项',
      deleteWhole: '删除整个角色',
      primary: '主形象',
      secondary: '子形象',
    },
    location: {
      regenerateImage: '重新生成',
    },
    video: {
      panelCard: {
        editPrompt: '编辑',
      },
    },
  },
} as const

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: AbstractIntlMessages
  timeZone: string
  children?: React.ReactNode
}>

function renderWithIntl(node: React.ReactElement) {
  return renderToStaticMarkup(
    createElement(
      TestIntlProvider,
      {
        locale: 'zh',
        messages: messages as unknown as AbstractIntlMessages,
        timeZone: 'Asia/Shanghai',
      },
      node,
    ),
  )
}

describe('project CharacterCard delete controls', () => {
  it('uses delete options for an unconfirmed multi-image child appearance', async () => {
    Reflect.set(globalThis, 'React', React)
    const { default: CharacterCard } = await import('@/features/project-workspace/components/assets/CharacterCard')

    const html = renderWithIntl(
      createElement(CharacterCard, {
        character: {
          id: 'character-1',
          name: '沈烬',
          customVoiceUrl: null,
          appearances: [],
        },
        appearance: {
          id: 'appearance-2',
          appearanceIndex: 1,
          changeReason: '换装',
          description: '黑色礼服',
          descriptions: ['黑色礼服'],
          imageUrl: null,
          imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
          previousImageUrl: null,
          previousImageUrls: [],
          previousDescription: null,
          previousDescriptions: null,
          selectedIndex: null,
        },
        onEdit: () => undefined,
        onDelete: () => undefined,
        onDeleteAppearance: () => undefined,
        onRegenerate: () => undefined,
        onGenerate: () => undefined,
        onUndo: () => undefined,
        onImageClick: () => undefined,
        showDeleteButton: true,
        appearanceCount: 2,
        onSelectImage: () => undefined,
        activeTaskKeys: new Set<string>(),
        onClearTaskKey: () => undefined,
        onImageEdit: () => undefined,
        isPrimaryAppearance: false,
        primaryAppearanceSelected: true,
        projectId: 'project-1',
        onConfirmSelection: () => undefined,
        onVoiceChange: () => undefined,
        onVoiceDesign: () => undefined,
        onVoiceSelectFromHub: () => undefined,
      }),
    )

    expect(html).toContain('title="删除选项"')
    expect(html).not.toContain('title="删除角色"')
  })
})
