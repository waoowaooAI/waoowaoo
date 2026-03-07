import { describe, expect, it } from 'vitest'
import {
  buildVideoSubmissionKey,
  createVideoSubmissionBaseline,
  shouldResolveVideoSubmissionLock,
} from '@/lib/novel-promotion/stages/video-stage-runtime/immediate-video-submission'

describe('immediate video submission lock', () => {
  it('regenerating an existing video -> keeps local lock until task state or output changes', () => {
    const panel = {
      panelId: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      videoUrl: 'https://example.com/original.mp4',
      videoErrorMessage: null,
      videoTaskRunning: false,
    }
    const baseline = createVideoSubmissionBaseline(panel)

    expect(buildVideoSubmissionKey(panel)).toBe('panel-1')
    expect(
      shouldResolveVideoSubmissionLock(
        {
          ...panel,
          videoTaskRunning: false,
        },
        baseline,
        baseline.startedAt + 1_000,
      ),
    ).toBe(false)
    expect(
      shouldResolveVideoSubmissionLock(
        {
          ...panel,
          videoTaskRunning: true,
        },
        baseline,
        baseline.startedAt + 1_000,
      ),
    ).toBe(true)
    expect(
      shouldResolveVideoSubmissionLock(
        {
          ...panel,
          videoUrl: 'https://example.com/regenerated.mp4',
        },
        baseline,
        baseline.startedAt + 1_000,
      ),
    ).toBe(true)
  })
})
