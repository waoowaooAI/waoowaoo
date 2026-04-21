import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RatioSelector, StylePresetSelector, StyleSelector } from '@/components/selectors/RatioStyleSelectors'

const portalMocks = vi.hoisted(() => {
  return {
    currentPortalTarget: null as unknown,
    createPortalMock: vi.fn((node: React.ReactNode, target: unknown) => {
      const targetLabel = target === portalMocks.currentPortalTarget ? 'body' : 'unknown'
      return createElement('div', { 'data-portal-target': targetLabel }, node)
    }),
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useState: <T,>(initialState: T | (() => T)) => {
      const resolvedInitialState = typeof initialState === 'function'
        ? (initialState as () => T)()
        : initialState

      if (resolvedInitialState === false) {
        return actual.useState(true as T)
      }

      return actual.useState(resolvedInitialState)
    },
  }
})

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: portalMocks.createPortalMock,
  }
})

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) =>
    createElement('span', { 'data-icon': name, className }),
}))

describe('RatioStyleSelectors', () => {
  afterEach(() => {
    vi.clearAllMocks()
    portalMocks.currentPortalTarget = null
    Reflect.deleteProperty(globalThis, 'React')
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('renders ratio, style, and style preset dropdown panels through a portal to document.body', () => {
    const fakeDocument = {
      body: { nodeName: 'BODY' },
    }

    Reflect.set(globalThis, 'React', React)
    portalMocks.currentPortalTarget = fakeDocument.body
    Reflect.set(globalThis, 'document', fakeDocument)

    const html = renderToStaticMarkup(
      createElement('div', null,
        createElement(RatioSelector, {
          value: '9:16',
          onChange: () => undefined,
          options: [
            { value: '9:16', label: '9:16' },
            { value: '16:9', label: '16:9' },
          ],
        }),
        createElement(StyleSelector, {
          value: 'realistic',
          onChange: () => undefined,
          options: [
            { value: 'realistic', label: '真人风格' },
            { value: 'american-comic', label: '美漫风格' },
          ],
        }),
        createElement(StylePresetSelector, {
          value: 'horror-suspense',
          onChange: () => undefined,
          options: [
            { value: '', label: '无', description: '不启用' },
            { value: 'horror-suspense', label: '恐怖悬疑', description: '压迫氛围' },
            { value: 'dark-noir', label: '暗黑黑色', description: '冷峻低照' },
          ],
        }),
      ),
    )

    expect(portalMocks.createPortalMock).toHaveBeenCalledTimes(3)
    expect(portalMocks.createPortalMock.mock.calls[0]?.[1]).toBe(fakeDocument.body)
    expect(portalMocks.createPortalMock.mock.calls[1]?.[1]).toBe(fakeDocument.body)
    expect(portalMocks.createPortalMock.mock.calls[2]?.[1]).toBe(fakeDocument.body)
    expect(html).toContain('data-portal-target="body"')
    expect(html).toContain('data-icon="sparklesAlt"')
    expect(html).toContain('data-icon="clapperboard"')
    expect(html).toContain('真人风格')
    expect(html).toContain('16:9')
    expect(html).toContain('恐怖悬疑')
    expect(html).toContain('无')
    expect(html).toContain('压迫氛围')
    expect(html).not.toContain('导演风格')
  })
})
