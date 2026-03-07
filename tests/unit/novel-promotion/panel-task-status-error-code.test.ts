import { describe, expect, it } from 'vitest'
import { usePanelTaskStatus } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelTaskStatus'

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
