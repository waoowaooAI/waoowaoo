import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'

const useQueryMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}))

vi.mock('@/components/ui/ImagePreviewModal', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/lib/task/presentation', () => ({
  resolveTaskPresentationState: () => null,
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: (props: { src: string; alt: string; className?: string; containerClassName?: string }) =>
    createElement('img', {
      src: props.src,
      alt: props.alt,
      className: [props.className, props.containerClassName].filter(Boolean).join(' '),
    }),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: (props: { name?: string; className?: string }) =>
    createElement('span', { 'data-icon': props.name, className: props.className }),
}))

const messages = {
  assetPicker: {
    selectCharacter: '从资产中心选择角色',
    selectLocation: '从资产中心选择场景',
    selectProp: '从资产中心选择道具',
    selectVoice: '从资产中心选择音色',
    searchPlaceholder: '搜索资产名称或文件夹...',
    noAssets: '资产中心暂无资产',
    createInAssetHub: '请先在资产中心创建角色/场景/音色',
    noSearchResults: '未找到匹配的资产',
    appearances: '个形象',
    images: '张图片',
    cancel: '取消',
    confirmCopy: '确认导入',
  },
} as const

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: AbstractIntlMessages
  timeZone: string
  children?: React.ReactNode
}>

describe('GlobalAssetPicker preview mapping', () => {
  it('renders the real character preview image at 3:2 without the appearance count line', async () => {
    Reflect.set(globalThis, 'React', React)
    useQueryMock.mockReset()
    useQueryMock.mockImplementation((options: { enabled?: boolean }) => ({
      data: options.enabled ? [{
        id: 'character-1',
        kind: 'character',
        family: 'visual',
        scope: 'global',
        name: '西装男',
        folderId: null,
        capabilities: {
          canGenerate: true,
          canSelectRender: true,
          canRevertRender: true,
          canModifyRender: true,
          canUploadRender: true,
          canBindVoice: true,
          canCopyFromGlobal: false,
        },
        taskRefs: [],
        taskState: { isRunning: false, lastError: null },
        introduction: null,
        profileData: null,
        profileConfirmed: null,
        voice: {
          voiceType: null,
          voiceId: null,
          customVoiceUrl: null,
          media: null,
        },
        variants: [{
          id: 'variant-1',
          index: 0,
          label: '默认形象',
          description: '黑西装',
          selectionState: { selectedRenderIndex: 0 },
          taskRefs: [],
          taskState: { isRunning: false, lastError: null },
          renders: [{
            id: 'render-1',
            index: 0,
            imageUrl: 'https://example.com/character.png',
            media: null,
            isSelected: true,
            previousImageUrl: null,
            previousMedia: null,
            taskRefs: [],
            taskState: { isRunning: false, lastError: null },
          }],
        }],
      }] : [],
      isFetching: false,
      refetch: vi.fn(),
    }))

    const { default: GlobalAssetPicker } = await import('@/components/shared/assets/GlobalAssetPicker')
    const html = renderToStaticMarkup(
      createElement(
        TestIntlProvider,
        {
          locale: 'zh',
          messages: messages as unknown as AbstractIntlMessages,
          timeZone: 'Asia/Shanghai',
        },
        createElement(GlobalAssetPicker, {
          isOpen: true,
          onClose: () => undefined,
          onSelect: () => undefined,
          type: 'character',
        }),
      ),
    )

    expect(html).toContain('src="https://example.com/character.png"')
    expect(html).toContain('aspect-[3/2]')
    expect(html).toContain('object-contain')
    expect(html).not.toContain('data-icon="userAlt"')
    expect(html).not.toContain('border-b')
    expect(html).not.toContain('个形象')
  })
})
