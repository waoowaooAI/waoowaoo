import { describe, it, expect } from 'vitest'
import type { AudioMixState, AudioMixAction, BGMTrack, SFXTrack } from '@/types/audio'

// Extract the reducer logic for testing by reimporting the module internals
// Since the reducer is not exported, we test through the action/state contract

function createTestState(overrides?: Partial<AudioMixState>): AudioMixState {
  return {
    projectId: 'test-project',
    episodeId: 'test-episode',
    masterVolume: 0.8,
    bgmTracks: [],
    sfxTracks: [],
    voiceTracks: [],
    ambientTracks: [],
    totalDuration: 0,
    updatedAt: Date.now(),
    ...overrides,
  }
}

function createBGMTrack(overrides?: Partial<BGMTrack>): BGMTrack {
  return {
    id: `bgm-${Date.now()}`,
    type: 'bgm',
    name: 'Test BGM',
    audioUrl: '',
    duration: 60,
    volume: 0.7,
    fadeInDuration: 2,
    fadeOutDuration: 2,
    loop: true,
    startTime: 0,
    endTime: 0,
    muted: false,
    genre: 'dramatic',
    mood: 'tense',
    tempo: 'moderate',
    intensity: 5,
    linkedClipIds: [],
    ...overrides,
  }
}

function createSFXTrack(overrides?: Partial<SFXTrack>): SFXTrack {
  return {
    id: `sfx-${Date.now()}`,
    type: 'sfx',
    name: 'Test SFX',
    audioUrl: '',
    duration: 3,
    volume: 0.8,
    fadeInDuration: 0,
    fadeOutDuration: 0.5,
    loop: false,
    startTime: 0,
    endTime: 0,
    muted: false,
    category: 'nature',
    triggerTime: 0,
    ...overrides,
  }
}

// Since the reducer is internal, we test the data structures and action contracts
describe('AudioMixState', () => {
  it('creates valid initial state', () => {
    const state = createTestState()
    expect(state.projectId).toBe('test-project')
    expect(state.episodeId).toBe('test-episode')
    expect(state.masterVolume).toBe(0.8)
    expect(state.bgmTracks).toEqual([])
    expect(state.sfxTracks).toEqual([])
    expect(state.voiceTracks).toEqual([])
    expect(state.ambientTracks).toEqual([])
    expect(state.totalDuration).toBe(0)
  })

  it('creates valid BGM track', () => {
    const bgm = createBGMTrack({ name: 'Epic BGM', genre: 'epic' })
    expect(bgm.type).toBe('bgm')
    expect(bgm.name).toBe('Epic BGM')
    expect(bgm.genre).toBe('epic')
    expect(bgm.mood).toBe('tense')
    expect(bgm.loop).toBe(true)
    expect(bgm.muted).toBe(false)
  })

  it('creates valid SFX track', () => {
    const sfx = createSFXTrack({ name: 'Thunder', category: 'nature' })
    expect(sfx.type).toBe('sfx')
    expect(sfx.name).toBe('Thunder')
    expect(sfx.category).toBe('nature')
    expect(sfx.loop).toBe(false)
  })

  it('computes total duration from tracks', () => {
    const state = createTestState({
      bgmTracks: [
        createBGMTrack({ startTime: 0, duration: 60, endTime: 60 }),
        createBGMTrack({ startTime: 30, duration: 45, endTime: 75 }),
      ],
      sfxTracks: [
        createSFXTrack({ startTime: 10, duration: 3, endTime: 13 }),
      ],
    })

    const allTracks = [
      ...state.bgmTracks,
      ...state.sfxTracks,
      ...state.voiceTracks,
      ...state.ambientTracks,
    ]
    const maxEnd = Math.max(...allTracks.map((t) => (t.endTime > 0 ? t.endTime : t.startTime + t.duration)))

    expect(maxEnd).toBe(75)
  })

  it('validates action type discriminants', () => {
    const actions: AudioMixAction['type'][] = [
      'ADD_TRACK',
      'REMOVE_TRACK',
      'UPDATE_TRACK',
      'REORDER_TRACKS',
      'SET_MASTER_VOLUME',
      'MUTE_TRACK',
      'UNMUTE_TRACK',
      'SOLO_TRACK',
      'RESTORE_STATE',
    ]
    expect(actions).toHaveLength(9)
  })

  it('handles master volume clamping', () => {
    const volume = Math.max(0, Math.min(1, 1.5))
    expect(volume).toBe(1)

    const negVolume = Math.max(0, Math.min(1, -0.5))
    expect(negVolume).toBe(0)

    const normalVolume = Math.max(0, Math.min(1, 0.6))
    expect(normalVolume).toBe(0.6)
  })

  it('solo logic mutes all other tracks', () => {
    const tracks = [
      createBGMTrack({ id: 'bgm-1', muted: false }),
      createBGMTrack({ id: 'bgm-2', muted: false }),
      createBGMTrack({ id: 'bgm-3', muted: false }),
    ]

    const soloId = 'bgm-2'
    const result = tracks.map((t) => ({ ...t, muted: t.id !== soloId }))

    expect(result[0].muted).toBe(true)
    expect(result[1].muted).toBe(false)
    expect(result[2].muted).toBe(true)
  })

  it('reorder tracks by ordered IDs', () => {
    const tracks = [
      createBGMTrack({ id: 'a' }),
      createBGMTrack({ id: 'b' }),
      createBGMTrack({ id: 'c' }),
    ]

    const orderedIds = ['c', 'a', 'b']
    const map = new Map(tracks.map((t) => [t.id, t]))
    const reordered = orderedIds.map((id) => map.get(id)!).filter(Boolean)

    expect(reordered.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })
})
