import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import Navbar from '@/components/Navbar'

const useSessionMock = vi.fn()
vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => createElement('img', { alt, ...props }),
}))

vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => createElement('div', null, 'LanguageSwitcher'),
}))

vi.mock('@/hooks/common/useGithubReleaseUpdate', () => ({
  useGithubReleaseUpdate: () => ({
    currentVersion: '0.3.0',
    update: null,
    shouldPulse: false,
    showModal: false,
    openModal: () => undefined,
    dismissCurrentUpdate: () => undefined,
    checkNow: async () => undefined,
  }),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string; query?: Record<string, string> }
    children: React.ReactNode
  } & Record<string, unknown>) => {
    if (typeof href === 'string') {
      return createElement('a', { href, ...props }, children)
    }

    const query = href.query ? `?${new URLSearchParams(href.query).toString()}` : ''
    const resolvedHref = `${href.pathname}${query}`
    return createElement('a', { href: resolvedHref, ...props }, children)
  },
}))

const messages = {
  nav: {
    workspace: '工作区',
    assetHub: '资产中心',
    profile: '设置中心',
    settingsMenu: {
      apiConfig: 'API 配置',
      stylePresets: '我的风格',
      billingRecords: '扣费记录',
    },
    downloadLogs: '下载日志',
    signin: '登录',
    signup: '注册',
  },
  common: {
    appName: 'waoowaoo',
    betaVersion: 'Beta v{version}',
    updateNotice: {
      openDialog: '打开更新弹窗',
      updateTag: '更新',
      checkUpdate: '检查更新',
      upToDate: '已是最新版本',
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

describe('Navbar download logs entry', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
  })

  it('renders the download logs entry on the far-right action group for signed-in users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Earth' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).toContain('下载日志')
    expect(html).toContain('href="/home"')
    expect(html).toContain('href="/api/admin/download-logs"')
    expect(html).toContain('download=""')
  })

  it('renders settings center dropdown targets for signed-in users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Earth' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('href="/profile?section=apiConfig"')
    expect(html).toContain('href="/profile?section=stylePresets"')
    expect(html).toContain('href="/profile?section=billing"')
    expect(html.indexOf('API 配置')).toBeLessThan(html.indexOf('我的风格'))
    expect(html.indexOf('我的风格')).toBeLessThan(html.indexOf('扣费记录'))
  })

  it('does not keep a persistent selected state on the current navbar route', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Earth' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).toContain('glass-selection-control')
    expect(html).not.toContain('aria-current="page"')
    expect(html).not.toContain('data-active="true"')
  })

  it('does not render the download logs entry for signed-out users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).not.toContain('下载日志')
    expect(html).not.toContain('/api/admin/download-logs')
  })
})
