import { describe, expect, it } from 'vitest'
import { buildInsertPanelLocationsDescription } from '@/lib/project-workflow/insert-panel-prompt-context'
import { resolveInsertPanelUserInput } from '@/lib/project-workflow/insert-panel'
import { usePanelTaskStatus } from '@/features/project-workspace/components/video/panel-card/runtime/hooks/usePanelTaskStatus'

describe('insert panel prompt context', () => {
  it('injects available slots for related selected location images', () => {
    const text = buildInsertPanelLocationsDescription(
      [
        {
          name: '餐厅',
          images: [
            {
              isSelected: true,
              description: '长方形饭桌位于画面中央',
              availableSlots: JSON.stringify([
                '饭桌左侧靠桌边的位置',
              ]),
            },
          ],
        },
        {
          name: '客厅',
          images: [{ isSelected: true, description: '不会被选中' }],
        },
      ],
      ['餐厅'],
    )

    expect(text).toContain('餐厅: 长方形饭桌位于画面中央')
    expect(text).toContain('可站位置：')
    expect(text).toContain('饭桌左侧靠桌边的位置')
    expect(text).not.toContain('客厅')
  })
})

describe('insert panel user input normalization', () => {
  it('uses localized default instruction when AI analyze sends empty input', () => {
    expect(resolveInsertPanelUserInput({ userInput: '' }, 'zh')).toBe(
      '请根据前后镜头自动分析并插入一个自然衔接的新分镜。',
    )
    expect(resolveInsertPanelUserInput({ userInput: '   ' }, 'en')).toBe(
      'Automatically analyze the surrounding panels and insert a naturally connected new panel.',
    )
  })

  it('prefers explicit user input over fallback prompt or default', () => {
    expect(resolveInsertPanelUserInput({
      userInput: '  添加一个特写反应镜头  ',
      prompt: 'unused prompt',
    }, 'zh')).toBe('添加一个特写反应镜头')
  })

  it('falls back to prompt when userInput is missing', () => {
    expect(resolveInsertPanelUserInput({
      prompt: '  Insert a pause beat between these panels.  ',
    }, 'en')).toBe('Insert a pause beat between these panels.')
  })
})

describe('panel task status error code mapping', () => {
  it('uses explicit error code for user-facing panel error display', () => {
    const result = usePanelTaskStatus({
      panel: {
        storyboardId: 'sb-1',
        panelIndex: 0,
        videoErrorCode: 'EXTERNAL_ERROR',
        videoErrorMessage: 'raw upstream message',
      },
      hasVisibleBaseVideo: false,
      tCommon: (key) => key,
    })

    expect(result.panelErrorDisplay?.code).toBe('EXTERNAL_ERROR')
    expect(result.panelErrorDisplay?.message).toBe('raw upstream message')
  })

  it('shows fixed unsupported-format message for VIDEO_API_FORMAT_UNSUPPORTED', () => {
    const result = usePanelTaskStatus({
      panel: {
        storyboardId: 'sb-1',
        panelIndex: 0,
        videoErrorCode: 'VIDEO_API_FORMAT_UNSUPPORTED',
        videoErrorMessage: 'VIDEO_API_FORMAT_UNSUPPORTED: OPENAI_COMPAT_VIDEO_TEMPLATE_TASK_ID_NOT_FOUND',
      },
      hasVisibleBaseVideo: false,
      tCommon: (key) => key,
    })

    expect(result.panelErrorDisplay?.code).toBe('VIDEO_API_FORMAT_UNSUPPORTED')
    expect(result.panelErrorDisplay?.message).toBe('当前视频接口格式暂不支持。')
  })
})
