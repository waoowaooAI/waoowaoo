import { describe, expect, it } from 'vitest'
import { useWorkspaceStageNavigation } from '@/features/project-workspace/hooks/useWorkspaceStageNavigation'
import type { StageArtifactReadiness } from '@/lib/project-workflow/stage-readiness'

const emptyArtifacts: StageArtifactReadiness = {
  hasStory: false,
  hasScript: false,
  hasStoryboard: false,
  hasVideo: false,
  hasVoice: false,
}

describe('workspace stage navigation canvas entry', () => {
  it('adds canvas as a first-class stage without replacing existing stages', () => {
    const items = useWorkspaceStageNavigation({
      isAnyOperationRunning: false,
      stageArtifacts: {
        ...emptyArtifacts,
        hasStory: true,
      },
      t: (key) => key,
    })

    expect(items.map((item) => item.id)).toEqual([
      'config',
      'canvas',
      'script',
      'storyboard',
      'videos',
      'editor',
    ])
    expect(items.find((item) => item.id === 'canvas')).toMatchObject({
      icon: 'C',
      label: 'stages.canvas',
      status: 'ready',
    })
  })

  it('marks canvas as processing when any operation is running', () => {
    const items = useWorkspaceStageNavigation({
      isAnyOperationRunning: true,
      stageArtifacts: emptyArtifacts,
      t: (key) => key,
    })

    expect(items.find((item) => item.id === 'canvas')?.status).toBe('processing')
  })
})
