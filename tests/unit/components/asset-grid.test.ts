import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { AssetGrid } from '@/app/[locale]/workspace/asset-hub/components/AssetGrid'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useState: <T,>(initialState: T | (() => T)) => {
      const resolvedInitialState = typeof initialState === 'function'
        ? (initialState as () => T)()
        : initialState

      if (resolvedInitialState === 'all') {
        return actual.useState('location' as T)
      }

      return actual.useState(resolvedInitialState)
    },
  }
})

vi.mock('@/app/[locale]/workspace/asset-hub/components/CharacterCard', () => ({
  CharacterCard: () => null,
}))

vi.mock('@/app/[locale]/workspace/asset-hub/components/LocationCard', () => ({
  LocationCard: () => null,
}))

vi.mock('@/app/[locale]/workspace/asset-hub/components/VoiceCard', () => ({
  VoiceCard: () => null,
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => null,
}))

const messages = {
  assetHub: {
    allAssets: '所有资产',
    characters: '角色',
    locations: '场景',
    props: '道具',
    voices: '音色',
    addAsset: '新建资产',
    addCharacter: '新建角色',
    addLocation: '新建场景',
    addProp: '新建道具',
    addVoice: '新建音色',
    downloadAll: '打包下载',
    downloadAllTitle: '下载全部图片资产',
    downloading: '打包中...',
    emptyState: '暂无资产',
    emptyStateHint: '点击上方按钮添加角色或场景',
    filteredEmptyHint: '点击新建资产添加资产',
    pagination: {
      previous: '上一页',
      next: '下一页',
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

describe('AssetGrid', () => {
  it('空状态下使用与资产库一致的 compact 分段控件，并在中间显示新建资产按钮', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(
      createElement(AssetGrid, {
        assets: [],
        loading: false,
        onAddCharacter: () => undefined,
        onAddLocation: () => undefined,
        onAddProp: () => undefined,
        onAddVoice: () => undefined,
        onDownloadAll: () => undefined,
        isDownloading: false,
        selectedFolderId: null,
      }),
    )

    expect(html).toContain('inline-block max-w-full min-w-max')
    expect(html).toContain('inline-grid grid-flow-col auto-cols-[minmax(96px,max-content)]')
    expect(html).toContain('justify-center')
    expect(html).toContain('>新建资产<')
  })

  it('当前筛选分类没有资产时显示添加提示文案', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(
      createElement(AssetGrid, {
        assets: [
          {
            id: 'character-1',
            kind: 'character',
            family: 'visual',
            scope: 'project',
            name: '角色A',
            folderId: null,
            capabilities: {
              canGenerate: true,
              canSelectRender: false,
              canRevertRender: false,
              canModifyRender: false,
              canUploadRender: false,
              canBindVoice: false,
              canCopyFromGlobal: false,
            },
            taskRefs: [],
            taskState: { isRunning: false, lastError: null },
            variants: [],
            introduction: null,
            profileData: null,
            profileConfirmed: null,
            voice: {
              voiceType: null,
              voiceId: null,
              customVoiceUrl: null,
              media: null,
            },
          },
        ],
        loading: false,
        onAddCharacter: () => undefined,
        onAddLocation: () => undefined,
        onAddProp: () => undefined,
        onAddVoice: () => undefined,
        onDownloadAll: () => undefined,
        isDownloading: false,
        selectedFolderId: null,
      }),
    )

    expect(html).toContain('点击新建资产添加资产')
  })
})
