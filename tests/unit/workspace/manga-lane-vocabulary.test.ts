import { describe, expect, it } from 'vitest'
import { findMangaVocabularyViolations } from '@/lib/workspace/manga-lane-vocabulary'

describe('manga lane vocabulary scanner (VAT-134)', () => {
  it('returns no violations for panel-first wording', () => {
    const scope = {
      description: 'Use panel-focused controls for chapter continuity',
      helper: 'Add panel beat at anchor',
      nested: {
        value: 'Keep storyboard flow stable',
      },
    }

    const violations = findMangaVocabularyViolations('en', scope)
    expect(violations).toEqual([])
  })

  it('detects video-like wording by locale', () => {
    expect(findMangaVocabularyViolations('en', { value: 'Generate video clip now' })).toHaveLength(2)
    expect(findMangaVocabularyViolations('vi', { value: 'Tạo video clip ngay' })).toHaveLength(2)
    expect(findMangaVocabularyViolations('ko', { value: '비디오 클립 생성' })).toHaveLength(2)
    expect(findMangaVocabularyViolations('zh', { value: '生成视频剪辑' })).toHaveLength(2)
  })
})
