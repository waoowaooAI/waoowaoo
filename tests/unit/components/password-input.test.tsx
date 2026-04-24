import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PasswordInput from '@/components/auth/PasswordInput'

describe('PasswordInput', () => {
  it('[initial render] -> hides password and exposes a show-password control', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordInput, {
        id: 'password',
        name: 'password',
        value: 'secret1',
        onChange: vi.fn(),
        autoComplete: 'current-password',
        placeholder: 'Enter your password',
        showLabel: 'Show password',
        hideLabel: 'Hide password',
        required: true,
      }),
    )

    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('aria-label="Show password"')
    expect(html).toContain('title="Show password"')
    expect(html).toContain('name="password"')
  })
})
