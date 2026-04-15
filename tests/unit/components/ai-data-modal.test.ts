import * as React from 'react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AIDataModal from '@/features/project-workspace/components/storyboard/AIDataModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('react-dom', () => ({
  createPortal: (node: unknown) => node,
}))

describe('AIDataModal', () => {
  it('在查看数据预览中展示角色完整数据与 slot', () => {
    Reflect.set(globalThis, 'React', React)
    vi.stubGlobal('document', { body: {} })

    const html = renderToStaticMarkup(
      createElement(AIDataModal, {
        isOpen: true,
        onClose: () => undefined,
        panelNumber: 1,
        shotType: 'medium shot',
        cameraMove: 'static',
        description: '皇帝立于大殿中央',
        location: '皇宫大殿',
        characters: [
          {
            name: '皇帝',
            appearance: '朝服形象',
            slot: '皇宫正中龙椅前方台阶下的位置',
          },
        ],
        videoPrompt: 'dramatic court scene',
        photographyRules: null,
        actingNotes: null,
        videoRatio: '16:9',
        onSave: () => undefined,
      }),
    )

    expect(html).toContain('&quot;characters&quot;')
    expect(html).toContain('&quot;appearance&quot;: &quot;朝服形象&quot;')
    expect(html).toContain('&quot;slot&quot;: &quot;皇宫正中龙椅前方台阶下的位置&quot;')
  })
})
