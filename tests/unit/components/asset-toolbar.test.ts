import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import AssetToolbar from '@/features/project-workspace/components/assets/AssetToolbar'

vi.mock('@/lib/query/hooks', () => ({
  useProjectAssets: vi.fn(() => ({ data: { characters: [], locations: [], props: [] } })),
  useProjectData: vi.fn(() => ({ data: { name: '项目A' } })),
}))

const messages = {
  assets: {
    common: {
      refresh: '刷新',
    },
    filterBar: {
      allEpisodes: '全部集数',
    },
    toolbar: {
      assetManagement: '资产管理',
      assetCount: '共 {total} 个资产（{appearances} 角色形象 + {locations} 场景 + {props} 道具）',
      globalAnalyze: '全局分析',
      globalAnalyzeHint: '分析所有资产',
      downloadAll: '下载全部',
      generateAll: '生成全部图片',
      regenerateAll: '重新生成全部',
      regenerateAllHint: '重新生成所有图片',
    },
    assetLibrary: {
      downloadEmpty: '没有可下载图片',
      downloadFailed: '下载失败',
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

describe('AssetToolbar', () => {
  it('删除批量生成与刷新按钮 -> 仅保留全局分析和下载入口', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(
      createElement(AssetToolbar, {
        projectId: 'project-1',
        totalAssets: 24,
        totalAppearances: 11,
        totalLocations: 13,
        totalProps: 0,
        isBatchSubmitting: false,
        isAnalyzingAssets: false,
        isGlobalAnalyzing: false,
        onGlobalAnalyze: () => undefined,
        episodeId: null,
        onEpisodeChange: () => undefined,
        episodes: [],
      }),
    )

    expect(html).toContain('全局分析')
    expect(html).toContain('title="下载全部"')
    expect(html).not.toContain('生成全部图片')
    expect(html).not.toContain('重新生成全部')
    expect(html).not.toContain('>刷新<')
  })
})
