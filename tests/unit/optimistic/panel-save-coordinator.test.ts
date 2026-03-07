import { describe, expect, it } from 'vitest'
import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'
import {
  PanelSaveCoordinator,
  type PanelSaveState,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/panel-save-coordinator'

function buildSnapshot(description: string): PanelEditData {
  return {
    id: 'panel-1',
    panelIndex: 0,
    panelNumber: 1,
    shotType: 'close-up',
    cameraMove: 'push',
    description,
    location: null,
    characters: [],
    srtStart: null,
    srtEnd: null,
    duration: null,
    videoPrompt: null,
  }
}

describe('PanelSaveCoordinator', () => {
  it('keeps single-flight and only flushes the latest snapshot after burst edits', async () => {
    const savedDescriptions: string[] = []
    let releaseFirstAttempt: () => void = () => {}
    const firstAttemptGate = new Promise<void>((resolve) => {
      releaseFirstAttempt = () => resolve()
    })
    let attempts = 0

    const coordinator = new PanelSaveCoordinator({
      onSavingChange: () => {},
      onStateChange: () => {},
      runSave: async ({ snapshot }) => {
        attempts += 1
        if (attempts === 1) {
          await firstAttemptGate
        }
        savedDescriptions.push(snapshot.description ?? '')
      },
      resolveErrorMessage: () => 'save failed',
    })

    const firstRun = coordinator.queue('panel-1', 'storyboard-1', buildSnapshot('v1'))
    coordinator.queue('panel-1', 'storyboard-1', buildSnapshot('v2'))
    coordinator.queue('panel-1', 'storyboard-1', buildSnapshot('v3'))

    releaseFirstAttempt()
    await firstRun

    expect(savedDescriptions).toEqual(['v1', 'v3'])
  })

  it('marks error on failure and clears unsaved state after retry success', async () => {
    const stateByPanel = new Map<string, PanelSaveState>()
    let attemptCount = 0

    const coordinator = new PanelSaveCoordinator({
      onSavingChange: () => {},
      onStateChange: (panelId, state) => {
        stateByPanel.set(panelId, state)
      },
      runSave: async () => {
        attemptCount += 1
        if (attemptCount === 1) {
          throw new Error('network timeout')
        }
      },
      resolveErrorMessage: (error) => (error instanceof Error ? error.message : 'unknown'),
    })

    const firstRun = coordinator.queue('panel-1', 'storyboard-1', buildSnapshot('draft text'))
    await firstRun
    expect(stateByPanel.get('panel-1')).toEqual({
      status: 'error',
      errorMessage: 'network timeout',
    })

    const retryRun = coordinator.retry('panel-1', buildSnapshot('draft text'))
    await retryRun
    expect(stateByPanel.get('panel-1')).toEqual({
      status: 'idle',
      errorMessage: null,
    })
  })
})
