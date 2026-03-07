import { describe, it, expect } from 'vitest'
import { USER_FEEDBACK_FORM_URL } from '@/lib/feedback'

describe('USER_FEEDBACK_FORM_URL', () => {
  it('should point to the Feishu feedback form', () => {
    expect(USER_FEEDBACK_FORM_URL).toBe(
      'https://ox2p5ferjnr.feishu.cn/share/base/form/shrcno200ar2SsTgGiSDYHLmNuc',
    )
  })
})

