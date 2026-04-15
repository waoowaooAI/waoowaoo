import { describe, expect, it, vi } from 'vitest'
import { copyPreviewJsonText } from '@/features/project-workspace/components/storyboard/AIDataModalPreviewPane'

describe('AIDataModalPreviewPane copy helper', () => {
  it('falls back to execCommand when clipboard api rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard denied')
    })
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    const select = vi.fn()
    const textarea = {
      value: '',
      style: {} as Record<string, string>,
      select,
    }

    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', {
      body: {
        appendChild,
        removeChild,
      },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
    })

    await expect(copyPreviewJsonText('{"a":1}')).resolves.toBeUndefined()

    expect(writeText).toHaveBeenCalledWith('{"a":1}')
    expect(appendChild).toHaveBeenCalledWith(textarea)
    expect(select).toHaveBeenCalled()
  })
})
