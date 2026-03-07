import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import { resolveTaskIntent } from '@/lib/task/intent'

describe('resolveTaskIntent', () => {
  it('maps generate task types', () => {
    expect(resolveTaskIntent(TASK_TYPE.IMAGE_CHARACTER)).toBe('generate')
    expect(resolveTaskIntent(TASK_TYPE.IMAGE_LOCATION)).toBe('generate')
    expect(resolveTaskIntent(TASK_TYPE.VIDEO_PANEL)).toBe('generate')
  })

  it('maps regenerate and modify task types', () => {
    expect(resolveTaskIntent(TASK_TYPE.REGENERATE_GROUP)).toBe('regenerate')
    expect(resolveTaskIntent(TASK_TYPE.PANEL_VARIANT)).toBe('regenerate')
    expect(resolveTaskIntent(TASK_TYPE.MODIFY_ASSET_IMAGE)).toBe('modify')
  })

  it('falls back to process for unknown types', () => {
    expect(resolveTaskIntent('unknown_type')).toBe('process')
    expect(resolveTaskIntent(null)).toBe('process')
    expect(resolveTaskIntent(undefined)).toBe('process')
  })
})
