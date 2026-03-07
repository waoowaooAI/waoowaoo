import { describe, expect, it } from 'vitest'
import {
  createAIDataModalDraftState,
  mergeAIDataModalDraftStateByDirty,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/useAIDataModalState'

describe('useAIDataModalState optimistic sync helpers', () => {
  it('keeps dirty fields when server data refreshes', () => {
    const localDraft = createAIDataModalDraftState({
      initialShotType: 'Close-up',
      initialCameraMove: 'Push in',
      initialDescription: 'user typing draft',
      initialVideoPrompt: 'prompt-a',
      initialPhotographyRules: null,
      initialActingNotes: null,
    })

    const serverDraft = createAIDataModalDraftState({
      initialShotType: 'Wide',
      initialCameraMove: 'Pan left',
      initialDescription: 'server-updated-desc',
      initialVideoPrompt: 'prompt-b',
      initialPhotographyRules: null,
      initialActingNotes: null,
    })

    const merged = mergeAIDataModalDraftStateByDirty(
      localDraft,
      serverDraft,
      new Set(['description']),
    )

    expect(merged.description).toBe('user typing draft')
    expect(merged.shotType).toBe('Wide')
    expect(merged.cameraMove).toBe('Pan left')
    expect(merged.videoPrompt).toBe('prompt-b')
  })

  it('syncs non-dirty nested fields from server', () => {
    const localDraft = createAIDataModalDraftState({
      initialShotType: 'A',
      initialCameraMove: 'B',
      initialDescription: 'C',
      initialVideoPrompt: 'D',
      initialPhotographyRules: {
        scene_summary: 'local scene',
        lighting: {
          direction: 'front',
          quality: 'soft',
        },
        characters: [{
          name: 'hero',
          screen_position: 'left',
          posture: 'standing',
          facing: 'camera',
        }],
        depth_of_field: 'deep',
        color_tone: 'warm',
      },
      initialActingNotes: [{
        name: 'hero',
        acting: 'smile',
      }],
    })

    const serverDraft = createAIDataModalDraftState({
      initialShotType: 'A2',
      initialCameraMove: 'B2',
      initialDescription: 'C2',
      initialVideoPrompt: 'D2',
      initialPhotographyRules: {
        scene_summary: 'server scene',
        lighting: {
          direction: 'back',
          quality: 'hard',
        },
        characters: [{
          name: 'hero',
          screen_position: 'center',
          posture: 'running',
          facing: 'right',
        }],
        depth_of_field: 'shallow',
        color_tone: 'cool',
      },
      initialActingNotes: [{
        name: 'hero',
        acting: 'angry',
      }],
    })

    const merged = mergeAIDataModalDraftStateByDirty(
      localDraft,
      serverDraft,
      new Set(['videoPrompt']),
    )

    expect(merged.videoPrompt).toBe('D')
    expect(merged.photographyRules?.scene_summary).toBe('server scene')
    expect(merged.photographyRules?.lighting.direction).toBe('back')
    expect(merged.actingNotes[0]?.acting).toBe('angry')
  })
})
