import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

type NovelPromotionMessages = {
  storyInput?: {
    manga?: {
      title?: string
      toggle?: string
    }
  }
}

function readLocale(locale: 'en' | 'vi' | 'zh' | 'ko'): NovelPromotionMessages {
  const filePath = path.join(process.cwd(), 'messages', locale, 'novel-promotion.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as NovelPromotionMessages
}

describe('manga entrypoint i18n label (VAT-87)', () => {
  it('uses unified title "Manga (Beta)" across locales', () => {
    for (const locale of ['en', 'vi', 'zh', 'ko'] as const) {
      const messages = readLocale(locale)
      expect(messages.storyInput?.manga?.title).toBe('Manga (Beta)')
    }
  })

  it('keeps locale-specific toggle copy for editor entrypoint', () => {
    const expectedToggle: Record<'en' | 'vi' | 'zh' | 'ko', string> = {
      en: 'Enable Manga mode',
      vi: 'Bật chế độ Manga',
      zh: '开启 Manga 模式',
      ko: 'Manga 모드 켜기',
    }

    for (const locale of Object.keys(expectedToggle) as Array<'en' | 'vi' | 'zh' | 'ko'>) {
      const messages = readLocale(locale)
      expect(messages.storyInput?.manga?.toggle).toBe(expectedToggle[locale])
    }
  })
})
