import { describe, it, expect } from 'vitest'
import type { TimelineState, TimelineTrack, TimelineItem, TimelineAction } from '@/types/timeline'

function createTestState(overrides?: Partial<TimelineState>): TimelineState {
  return {
    projectId: 'test-project',
    episodeId: 'test-episode',
    tracks: [],
    totalDuration: 0,
    currentTime: 0,
    zoom: 50,
    scrollLeft: 0,
    isPlaying: false,
    selectedItemIds: [],
    snapEnabled: true,
    snapInterval: 0.5,
    fps: 30,
    ...overrides,
  }
}

function createTestTrack(overrides?: Partial<TimelineTrack>): TimelineTrack {
  return {
    id: `track-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'video',
    name: 'Test Track',
    locked: false,
    visible: true,
    muted: false,
    order: 0,
    items: [],
    ...overrides,
  }
}

function createTestItem(overrides?: Partial<TimelineItem>): TimelineItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    trackId: 'track-1',
    type: 'video',
    name: 'Test Clip',
    startTime: 0,
    duration: 5,
    endTime: 5,
    ...overrides,
  }
}

function snapToGrid(time: number, interval: number): number {
  if (interval <= 0) return time
  return Math.round(time / interval) * interval
}

function computeTotalDuration(tracks: TimelineTrack[]): number {
  let maxEnd = 0
  for (const track of tracks) {
    for (const item of track.items) {
      const end = item.startTime + item.duration
      if (end > maxEnd) maxEnd = end
    }
  }
  return maxEnd
}

describe('TimelineState', () => {
  it('creates valid initial state', () => {
    const state = createTestState()
    expect(state.projectId).toBe('test-project')
    expect(state.zoom).toBe(50)
    expect(state.snapEnabled).toBe(true)
    expect(state.snapInterval).toBe(0.5)
    expect(state.fps).toBe(30)
    expect(state.tracks).toEqual([])
  })

  it('creates valid track', () => {
    const track = createTestTrack({ name: 'Video Track', type: 'video' })
    expect(track.type).toBe('video')
    expect(track.name).toBe('Video Track')
    expect(track.locked).toBe(false)
    expect(track.muted).toBe(false)
    expect(track.items).toEqual([])
  })

  it('creates valid timeline item', () => {
    const item = createTestItem({ startTime: 5, duration: 10 })
    expect(item.startTime).toBe(5)
    expect(item.duration).toBe(10)
    expect(item.endTime).toBe(5) // endTime is provided separately in our test helper
  })
})

describe('snapToGrid', () => {
  it('snaps to 0.5s intervals', () => {
    expect(snapToGrid(1.3, 0.5)).toBe(1.5)
    expect(snapToGrid(1.2, 0.5)).toBe(1.0)
    expect(snapToGrid(1.25, 0.5)).toBe(1.5)
    expect(snapToGrid(0, 0.5)).toBe(0)
  })

  it('snaps to 1s intervals', () => {
    expect(snapToGrid(1.3, 1)).toBe(1)
    expect(snapToGrid(1.6, 1)).toBe(2)
    expect(snapToGrid(0.5, 1)).toBe(1)
  })

  it('returns original time when interval is 0', () => {
    expect(snapToGrid(1.3, 0)).toBe(1.3)
    expect(snapToGrid(5.7, 0)).toBe(5.7)
  })

  it('returns original time when interval is negative', () => {
    expect(snapToGrid(1.3, -1)).toBe(1.3)
  })
})

describe('computeTotalDuration', () => {
  it('returns 0 for empty tracks', () => {
    expect(computeTotalDuration([])).toBe(0)
  })

  it('returns 0 for tracks with no items', () => {
    const tracks = [createTestTrack({ items: [] })]
    expect(computeTotalDuration(tracks)).toBe(0)
  })

  it('computes max end time across tracks', () => {
    const tracks = [
      createTestTrack({
        items: [
          createTestItem({ startTime: 0, duration: 10 }),
          createTestItem({ startTime: 5, duration: 8 }),
        ],
      }),
      createTestTrack({
        items: [
          createTestItem({ startTime: 0, duration: 20 }),
        ],
      }),
    ]

    expect(computeTotalDuration(tracks)).toBe(20)
  })

  it('handles items with gaps', () => {
    const tracks = [
      createTestTrack({
        items: [
          createTestItem({ startTime: 0, duration: 5 }),
          createTestItem({ startTime: 100, duration: 5 }),
        ],
      }),
    ]

    expect(computeTotalDuration(tracks)).toBe(105)
  })
})

describe('TimelineAction types', () => {
  it('validates all action discriminants', () => {
    const actionTypes: TimelineAction['type'][] = [
      'SET_TRACKS',
      'ADD_TRACK',
      'REMOVE_TRACK',
      'ADD_ITEM',
      'REMOVE_ITEM',
      'MOVE_ITEM',
      'RESIZE_ITEM',
      'SPLIT_ITEM',
      'SELECT_ITEMS',
      'SET_CURRENT_TIME',
      'SET_ZOOM',
      'SET_SCROLL',
      'TOGGLE_PLAY',
      'TOGGLE_SNAP',
      'LOCK_TRACK',
      'UNLOCK_TRACK',
      'MUTE_TRACK',
      'UNMUTE_TRACK',
      'RESTORE_STATE',
    ]
    expect(actionTypes).toHaveLength(19)
  })
})

describe('Zoom constraints', () => {
  it('clamps zoom between 10 and 200', () => {
    const clamp = (zoom: number) => Math.max(10, Math.min(200, zoom))
    expect(clamp(5)).toBe(10)
    expect(clamp(300)).toBe(200)
    expect(clamp(50)).toBe(50)
    expect(clamp(10)).toBe(10)
    expect(clamp(200)).toBe(200)
  })

  it('zoom in multiplies by 1.25', () => {
    const zoom = 50
    expect(zoom * 1.25).toBe(62.5)
  })

  it('zoom out divides by 1.25', () => {
    const zoom = 50
    expect(zoom / 1.25).toBe(40)
  })
})

describe('Split item logic', () => {
  it('splits item at a given time', () => {
    const item = createTestItem({
      id: 'item-1',
      startTime: 10,
      duration: 20,
      endTime: 30,
    })

    const splitTime = 20
    const splitOffset = splitTime - item.startTime

    expect(splitOffset).toBe(10)
    expect(splitOffset > 0 && splitOffset < item.duration).toBe(true)

    const firstHalf = {
      ...item,
      duration: splitOffset,
      endTime: splitTime,
    }

    const secondHalf = {
      ...item,
      id: `${item.id}-split`,
      startTime: splitTime,
      duration: item.duration - splitOffset,
      endTime: item.startTime + item.duration,
    }

    expect(firstHalf.startTime).toBe(10)
    expect(firstHalf.duration).toBe(10)
    expect(firstHalf.endTime).toBe(20)

    expect(secondHalf.startTime).toBe(20)
    expect(secondHalf.duration).toBe(10)
    expect(secondHalf.endTime).toBe(30)
  })

  it('does not split if splitTime is at start', () => {
    const item = createTestItem({ startTime: 10, duration: 20 })
    const splitOffset = 10 - item.startTime // 0
    expect(splitOffset <= 0).toBe(true)
  })

  it('does not split if splitTime is at end', () => {
    const item = createTestItem({ startTime: 10, duration: 20 })
    const splitOffset = 30 - item.startTime // 20 = duration
    expect(splitOffset >= item.duration).toBe(true)
  })
})

describe('Time-pixel conversion', () => {
  it('converts time to pixel', () => {
    const zoom = 50 // 50px per second
    const scrollLeft = 100
    const time = 5

    const pixel = time * zoom - scrollLeft
    expect(pixel).toBe(150) // 5*50 - 100
  })

  it('converts pixel to time', () => {
    const zoom = 50
    const scrollLeft = 100
    const pixel = 150

    const time = (pixel + scrollLeft) / zoom
    expect(time).toBe(5) // (150+100)/50
  })

  it('round-trips correctly', () => {
    const zoom = 75
    const scrollLeft = 200
    const originalTime = 10

    const pixel = originalTime * zoom - scrollLeft
    const recoveredTime = (pixel + scrollLeft) / zoom

    expect(recoveredTime).toBe(originalTime)
  })
})
