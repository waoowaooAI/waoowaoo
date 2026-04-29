import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { AI_EDIT_BUTTON_CLASS } from '@/components/ui/ai-edit-style'

const locationImageListMock = vi.hoisted(() => vi.fn((props: { overlayActions?: React.ReactNode }) => createElement('div', null, props.overlayActions ?? null)))
const uploadMutationMock = vi.hoisted(() => ({
  isPending: false,
  mutate: vi.fn(),
}))

vi.mock('@/lib/query/mutations', () => ({
  useUploadProjectLocationImage: () => uploadMutationMock,
}))

vi.mock('@/features/project-workspace/components/assets/location-card/LocationCardHeader', () => ({
  default: () => createElement('div', null),
}))

vi.mock('@/features/project-workspace/components/assets/location-card/LocationCardActions', () => ({
  default: () => createElement('div', null),
}))

vi.mock('@/features/project-workspace/components/assets/location-card/LocationImageList', () => ({
  default: locationImageListMock,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: () => createElement('span', null),
}))

vi.mock('@/components/ui/icons/AISparklesIcon', () => ({
  default: (props: { className?: string }) => createElement('svg', { className: props.className, 'data-icon': 'ai-sparkles' }),
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => createElement('span', null),
}))

vi.mock('@/components/image-generation/ImageGenerationInlineCountButton', () => ({
  default: () => createElement('button', null),
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

vi.mock('@/lib/task/presentation', () => ({
  resolveTaskPresentationState: () => null,
}))

const messages = {
  assets: {
    image: {
      upload: '上传图片',
      uploadReplace: '上传替换图片',
      edit: '编辑图片',
      undo: '撤回',
      regenerateStuck: '重新生成',
    },
    location: {
      regenerateImage: '重新生成场景',
      edit: '编辑场景',
      delete: '删除场景',
    },
    prop: {
      regenerateImage: '重新生成道具',
      edit: '编辑道具',
      delete: '删除道具',
    },
  },
} as const

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: AbstractIntlMessages
  timeZone: string
  children?: React.ReactNode
}>

describe('LocationCard AI edit button', () => {
  it('uses the shared AI edit button style in single-image mode', async () => {
    locationImageListMock.mockClear()
    Reflect.set(globalThis, 'React', React)
    const { default: LocationCard } = await import('@/features/project-workspace/components/assets/LocationCard')
    const html = renderToStaticMarkup(
      createElement(
        TestIntlProvider,
        {
          locale: 'zh',
          messages: messages as unknown as AbstractIntlMessages,
          timeZone: 'Asia/Shanghai',
        },
        createElement(LocationCard, {
          location: {
            id: 'prop-1',
            name: '银质餐具',
            summary: '银质西式餐具套装',
            selectedImageId: 'prop-image-1',
            images: [
              {
                id: 'prop-image-1',
                imageIndex: 0,
                description: '银质餐具套装，包含刀叉与汤匙，金属光泽冷白',
                imageUrl: 'https://example.com/prop.png',
                previousImageUrl: null,
                previousDescription: null,
                isSelected: true,
              },
            ],
          },
          assetType: 'prop',
          onEdit: () => undefined,
          onDelete: () => undefined,
          onRegenerate: () => undefined,
          onGenerate: () => undefined,
          onImageClick: () => undefined,
          onImageEdit: () => undefined,
          projectId: 'project-1',
        }),
      ),
    )

    expect(html).toContain('data-icon=\"ai-sparkles\"')
    for (const token of AI_EDIT_BUTTON_CLASS.split(' ')) {
      expect(html).toContain(token)
    }
    const firstCall = locationImageListMock.mock.calls[0]?.[0] as { aspectClassName?: string } | undefined
    expect(firstCall?.aspectClassName).toBeUndefined()
  })

  it('does not force a square image slot for project location cards', async () => {
    locationImageListMock.mockClear()
    Reflect.set(globalThis, 'React', React)
    const { default: LocationCard } = await import('@/features/project-workspace/components/assets/LocationCard')
    renderToStaticMarkup(
      createElement(
        TestIntlProvider,
        {
          locale: 'zh',
          messages: messages as unknown as AbstractIntlMessages,
          timeZone: 'Asia/Shanghai',
        },
        createElement(LocationCard, {
          location: {
            id: 'location-1',
            name: '餐厅',
            summary: '极简餐厅',
            selectedImageId: 'location-image-1',
            images: [
              {
                id: 'location-image-1',
                imageIndex: 0,
                description: '极简餐厅室内空间',
                imageUrl: 'https://example.com/location.png',
                previousImageUrl: null,
                previousDescription: null,
                isSelected: true,
              },
            ],
          },
          assetType: 'location',
          onEdit: () => undefined,
          onDelete: () => undefined,
          onRegenerate: () => undefined,
          onGenerate: () => undefined,
          onImageClick: () => undefined,
          onImageEdit: () => undefined,
          projectId: 'project-1',
        }),
      ),
    )

    const firstCall = locationImageListMock.mock.calls[0]?.[0] as { aspectClassName?: string } | undefined
    expect(firstCall?.aspectClassName).toBeUndefined()
  })
})
