'use client'

import type { PanelEditData } from '../../PanelEditForm'

export type PanelSaveStatus = 'idle' | 'saving' | 'error'

export interface PanelSaveState {
  status: PanelSaveStatus
  errorMessage: string | null
}

interface PanelSaveRuntime {
  inFlight: boolean
  needsResave: boolean
  storyboardId: string | null
  latestSnapshot: PanelEditData | null
  requestSeq: number
  processorPromise: Promise<void> | null
}

export interface PanelSaveCoordinatorCallbacks {
  onSavingChange: (panelId: string, isSaving: boolean) => void
  onStateChange: (panelId: string, state: PanelSaveState) => void
  runSave: (params: { panelId: string; storyboardId: string; snapshot: PanelEditData }) => Promise<void>
  resolveErrorMessage: (error: unknown) => string
}

function clonePanelEditData(data: PanelEditData): PanelEditData {
  return {
    ...data,
    characters: data.characters.map((character) => ({ ...character })),
  }
}

export class PanelSaveCoordinator {
  private callbacks: PanelSaveCoordinatorCallbacks

  private runtimeByPanel: Record<string, PanelSaveRuntime> = {}

  constructor(callbacks: PanelSaveCoordinatorCallbacks) {
    this.callbacks = callbacks
  }

  updateCallbacks(callbacks: PanelSaveCoordinatorCallbacks) {
    this.callbacks = callbacks
  }

  queue(
    panelId: string,
    storyboardId: string,
    snapshot: PanelEditData | null | undefined,
  ): Promise<void> | null {
    if (!snapshot?.id) return null

    const runtime = this.ensureRuntime(panelId)
    runtime.storyboardId = storyboardId
    runtime.latestSnapshot = clonePanelEditData(snapshot)
    runtime.needsResave = true
    return this.startProcessor(panelId, runtime)
  }

  retry(panelId: string, snapshotOverride?: PanelEditData | null): Promise<void> | null {
    const runtime = this.runtimeByPanel[panelId]
    if (!runtime?.storyboardId) return null
    const snapshot = snapshotOverride ?? runtime.latestSnapshot
    if (!snapshot?.id) return null
    return this.queue(panelId, runtime.storyboardId, snapshot)
  }

  clear(panelId: string) {
    delete this.runtimeByPanel[panelId]
  }

  private ensureRuntime(panelId: string): PanelSaveRuntime {
    if (!this.runtimeByPanel[panelId]) {
      this.runtimeByPanel[panelId] = {
        inFlight: false,
        needsResave: false,
        storyboardId: null,
        latestSnapshot: null,
        requestSeq: 0,
        processorPromise: null,
      }
    }
    return this.runtimeByPanel[panelId]
  }

  private startProcessor(panelId: string, runtime: PanelSaveRuntime): Promise<void> {
    if (runtime.processorPromise) return runtime.processorPromise

    runtime.processorPromise = (async () => {
      while (runtime.needsResave) {
        runtime.needsResave = false
        runtime.inFlight = true
        await this.executeSaveAttempt(panelId, runtime)
        runtime.inFlight = false
      }
    })().finally(() => {
      runtime.processorPromise = null
      runtime.inFlight = false
    })

    return runtime.processorPromise
  }

  private async executeSaveAttempt(panelId: string, runtime: PanelSaveRuntime) {
    const snapshot = runtime.latestSnapshot
    const storyboardId = runtime.storyboardId
    if (!snapshot?.id || !storyboardId) return

    runtime.requestSeq += 1
    const requestSeq = runtime.requestSeq

    this.callbacks.onSavingChange(panelId, true)
    this.callbacks.onStateChange(panelId, { status: 'saving', errorMessage: null })

    try {
      await this.callbacks.runSave({
        panelId,
        storyboardId,
        snapshot,
      })
      if (runtime.requestSeq === requestSeq) {
        this.callbacks.onStateChange(panelId, { status: 'idle', errorMessage: null })
      }
    } catch (error: unknown) {
      if (runtime.requestSeq === requestSeq) {
        this.callbacks.onStateChange(panelId, {
          status: 'error',
          errorMessage: this.callbacks.resolveErrorMessage(error),
        })
      }
    } finally {
      this.callbacks.onSavingChange(panelId, false)
    }
  }
}
