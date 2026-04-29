import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { FolderSidebar } from '@/app/[locale]/workspace/asset-hub/components/FolderSidebar'

const messages = {
  assetHub: {
    folders: '文件夹',
    newFolder: '新建文件夹',
    allAssets: '所有资产',
    editFolder: '编辑文件夹',
    deleteFolder: '删除文件夹',
    noFolders: '暂无文件夹',
  },
} as const

const renderWithIntl = (node: ReactElement) => {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps))
}

describe('FolderSidebar selection state', () => {
  it('uses the shared neutral selection state for the active folder', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(
      createElement(FolderSidebar, {
        folders: [{ id: 'folder-1', name: 'aa' }],
        selectedFolderId: 'folder-1',
        onSelectFolder: vi.fn(),
        onCreateFolder: vi.fn(),
        onEditFolder: vi.fn(),
        onDeleteFolder: vi.fn(),
      }),
    )

    expect(html).toContain('class="glass-selection-control group flex items-center gap-2 px-3 py-2 rounded-lg"')
    expect(html).toContain('data-active="true"')
    expect(html).not.toContain('glass-tone-info-bg')
  })
})
