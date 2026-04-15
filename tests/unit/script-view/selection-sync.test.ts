import { describe, expect, it } from 'vitest'
import {
  reuseStringArrayIfEqual,
  reuseStringSetIfEqual,
} from '@/features/project-workspace/components/script-view/selection-sync'

describe('script view selection sync', () => {
  it('reuses the previous array reference when ids are unchanged', () => {
    const previous = ['char-1', 'char-2']
    const next = ['char-1', 'char-2']

    const result = reuseStringArrayIfEqual(previous, next)

    expect(result).toBe(previous)
  })

  it('returns the next array when ids changed', () => {
    const previous = ['char-1', 'char-2']
    const next = ['char-1', 'prop-1']

    const result = reuseStringArrayIfEqual(previous, next)

    expect(result).toBe(next)
  })

  it('reuses the previous set reference when selected appearance keys are unchanged', () => {
    const previous = new Set(['char-1::Base', 'char-2::Alt'])
    const next = new Set(['char-2::Alt', 'char-1::Base'])

    const result = reuseStringSetIfEqual(previous, next)

    expect(result).toBe(previous)
  })

  it('returns the next set when selected appearance keys changed', () => {
    const previous = new Set(['char-1::Base'])
    const next = new Set(['char-1::Base', 'char-2::Alt'])

    const result = reuseStringSetIfEqual(previous, next)

    expect(result).toBe(next)
  })
})
