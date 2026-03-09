import { describe, expect, it } from 'vitest'
import {
  parseQuickMangaFacadeRequest,
  readQuickMangaOptionsFromPayload,
  resolveQuickMangaTaskType,
} from '@/lib/novel-promotion/quick-manga-contract'
import { TASK_TYPE } from '@/lib/task/types'

describe('quick manga contract helpers', () => {
  it('parses story-to-script request with defaults', () => {
    const parsed = parseQuickMangaFacadeRequest({
      episodeId: 'ep-1',
      content: 'hello world',
    })

    expect(parsed).toEqual({
      episodeId: 'ep-1',
      stage: 'story-to-script',
      content: 'hello world',
      options: {
        enabled: true,
        preset: 'auto',
        layout: 'auto',
        colorMode: 'auto',
        style: null,
      },
      controls: {
        styleLock: {
          enabled: false,
          profile: 'auto',
          strength: 0.65,
        },
        chapterContinuity: {
          mode: 'off',
          chapterId: null,
          conflictPolicy: 'balanced',
        },
      },
      continuity: null,
    })
  })

  it('returns null for story-to-script without content', () => {
    expect(parseQuickMangaFacadeRequest({
      episodeId: 'ep-1',
      stage: 'story-to-script',
      content: '   ',
    })).toBeNull()
  })

  it('supports script-to-storyboard without content and normalizes enums', () => {
    const parsed = parseQuickMangaFacadeRequest({
      episodeId: 'ep-2',
      stage: 'script-to-storyboard',
      quickManga: {
        enabled: true,
        preset: 'romance-drama',
        layout: 'splash-focus',
        colorMode: 'black-white',
        style: ' shojo ink ',
      },
      quickMangaControls: {
        styleLock: {
          enabled: true,
          profile: 'line-consistent',
          strength: 0.9,
        },
        chapterContinuity: {
          mode: 'chapter-strict',
          chapterId: ' chapter-02 ',
          conflictPolicy: 'prefer-style-lock',
        },
      },
    })

    expect(parsed).toEqual({
      episodeId: 'ep-2',
      stage: 'script-to-storyboard',
      content: null,
      options: {
        enabled: true,
        preset: 'romance-drama',
        layout: 'splash-focus',
        colorMode: 'black-white',
        style: 'shojo ink',
      },
      controls: {
        styleLock: {
          enabled: true,
          profile: 'line-consistent',
          strength: 0.9,
        },
        chapterContinuity: {
          mode: 'chapter-strict',
          chapterId: 'chapter-02',
          conflictPolicy: 'prefer-style-lock',
        },
      },
      continuity: null,
    })
  })

  it('maps stage to task type', () => {
    expect(resolveQuickMangaTaskType('story-to-script')).toBe(TASK_TYPE.STORY_TO_SCRIPT_RUN)
    expect(resolveQuickMangaTaskType('script-to-storyboard')).toBe(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)
  })

  it('reads options from payload safely', () => {
    expect(readQuickMangaOptionsFromPayload({
      quickManga: {
        enabled: true,
        preset: 'action-battle',
        layout: 'vertical-scroll',
        colorMode: 'limited-palette',
        style: ' gritty ',
      },
    })).toEqual({
      enabled: true,
      preset: 'action-battle',
      layout: 'vertical-scroll',
      colorMode: 'limited-palette',
      style: 'gritty',
    })

    expect(readQuickMangaOptionsFromPayload({})).toEqual({
      enabled: false,
      preset: 'auto',
      layout: 'auto',
      colorMode: 'auto',
      style: null,
    })
  })
})
