import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import ScriptViewAssetsPanel from '@/features/project-workspace/components/script-view/ScriptViewAssetsPanel'

const messages = {
  scriptView: {
    inSceneAssets: '出场资产',
    assetView: {
      allClips: '全部片段',
    },
    segment: {
      title: '片段 {index}',
    },
    asset: {
      activeCharacters: '出场角色',
      activeLocations: '出场场景',
      defaultAppearance: '默认形象',
    },
    screenplay: {
      noCharacter: '当前片段未选择角色',
      noLocation: '当前片段未选择场景',
    },
    generate: {
      startGenerate: '开始生成',
    },
  },
  assets: {
    character: {
      primary: '初始形象',
    },
  },
  projectWorkflow: {
    buttons: {
      assetLibrary: '资产库',
    },
  },
  common: {
    edit: '编辑',
    cancel: '取消',
    confirm: '确定',
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

function renderPanel(propsCount: number) {
  Reflect.set(globalThis, 'React', React)

  const props = Array.from({ length: propsCount }, (_, index) => ({
    id: `prop-${index + 1}`,
    name: `道具${index + 1}`,
    summary: `道具描述${index + 1}`,
    selectedImageId: null,
    images: [],
  }))

  return renderWithIntl(
    createElement(ScriptViewAssetsPanel, {
      clips: [{ id: 'clip-1', location: null, props: null }],
      assetViewMode: 'all',
      setAssetViewMode: () => undefined,
      setSelectedClipId: () => undefined,
      characters: [],
      locations: [],
      props,
      activeCharIds: [],
      activeLocationIds: [],
      activePropIds: [],
      selectedAppearanceKeys: new Set<string>(),
      onUpdateClipAssets: async () => undefined,
      onOpenAssetLibrary: () => undefined,
      assetsLoading: false,
      assetsLoadingState: null,
      allAssetsHaveImages: true,
      globalCharIds: [],
      globalLocationIds: [],
      globalPropIds: [],
      missingAssetsCount: 0,
      onGenerateStoryboard: () => undefined,
      isSubmittingStoryboardBuild: false,
      getSelectedAppearances: () => [],
      tScript: (key: string, values?: Record<string, unknown>) => {
        if (key === 'inSceneAssets') return '出场资产'
        if (key === 'assetView.allClips') return '全部片段'
        if (key === 'segment.title') return `片段 ${String(values?.index ?? '')}`
        if (key === 'asset.activeCharacters') return '出场角色'
        if (key === 'asset.activeLocations') return '出场场景'
        if (key === 'screenplay.noCharacter') return '当前片段未选择角色'
        if (key === 'screenplay.noLocation') return '当前片段未选择场景'
        if (key === 'generate.startGenerate') return '开始生成'
        if (key === 'asset.defaultAppearance') return '默认形象'
        return key
      },
      tAssets: (key: string) => (key === 'character.primary' ? '初始形象' : key),
      tNP: (key: string) => (key === 'buttons.assetLibrary' ? '资产库' : key),
      tCommon: (key: string) => {
        if (key === 'edit') return '编辑'
        if (key === 'cancel') return '取消'
        if (key === 'confirm') return '确定'
        return key
      },
    }),
  )
}

describe('ScriptViewAssetsPanel', () => {
  it('hides the prop section when the project has no prop assets', () => {
    const html = renderPanel(0)

    expect(html).not.toContain('道具 (0)')
    expect(html).not.toContain('当前片段未选择道具')
  })

  it('keeps the prop section visible when the project has prop assets even if none are selected in the current clip', () => {
    const html = renderPanel(1)

    expect(html).toContain('道具 (0)')
    expect(html).toContain('当前片段未选择道具')
  })
})
