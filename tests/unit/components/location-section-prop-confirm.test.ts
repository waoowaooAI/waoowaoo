import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import LocationSection from '@/features/project-workspace/components/assets/LocationSection'

const locationCardMock = vi.hoisted(() => vi.fn((_props: unknown) => null))
const useProjectAssetsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/query/hooks/useProjectAssets', () => ({
  useProjectAssets: (projectId: string | null) => useProjectAssetsMock(projectId),
}))

vi.mock('@/features/project-workspace/components/assets/LocationCard', () => ({
  default: (props: unknown) => locationCardMock(props),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: () => null,
}))

const messages = {
  assets: {
    stage: {
      locationAssets: '场景资产',
      locationCounts: '{count} 个场景',
      propAssets: '道具资产',
      propCounts: '{count} 个道具',
    },
    location: {
      add: '新建场景',
    },
    prop: {
      add: '新建道具',
    },
  },
} as const

function renderWithIntl(node: ReactElement) {
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

describe('LocationSection prop confirm wiring', () => {
  it('passes the confirm-selection callback through to prop cards', () => {
    Reflect.set(globalThis, 'React', React)
    locationCardMock.mockClear()
    useProjectAssetsMock.mockReturnValue({
      data: {
        characters: [],
        locations: [],
        props: [{
          id: 'prop-1',
          name: '青铜匕首',
          summary: '古旧短刃',
          selectedImageId: 'prop-image-2',
          images: [
            {
              id: 'prop-image-1',
              imageIndex: 0,
              description: '候选 1',
              imageUrl: 'https://example.com/prop-1.png',
              isSelected: false,
            },
            {
              id: 'prop-image-2',
              imageIndex: 1,
              description: '候选 2',
              imageUrl: 'https://example.com/prop-2.png',
              isSelected: true,
            },
          ],
        }],
      },
    })

    renderWithIntl(
      createElement(LocationSection, {
        projectId: 'project-1',
        assetType: 'prop',
        activeTaskKeys: new Set<string>(),
        onClearTaskKey: () => undefined,
        onRegisterTransientTaskKey: () => undefined,
        onAddLocation: () => undefined,
        onDeleteLocation: () => undefined,
        onEditLocation: () => undefined,
        handleGenerateImage: async () => undefined,
        onConfirmSelection: () => undefined,
        onRegenerateSingle: async () => undefined,
        onRegenerateGroup: async () => undefined,
        onUndo: () => undefined,
        onImageClick: () => undefined,
        onImageEdit: () => undefined,
        onCopyFromGlobal: () => undefined,
        filterIds: null,
      }),
    )

    const firstCall = locationCardMock.mock.calls[0]?.[0] as { onConfirmSelection?: () => void } | undefined
    expect(firstCall).toBeDefined()
    expect(typeof firstCall?.onConfirmSelection).toBe('function')
  })
})
