import { describe, expect, it, vi } from 'vitest'
import {
  executeCanvasCommand,
  type CanvasCommandHandlers,
} from '@/lib/project-canvas/commands/canvas-command-registry'

function createHandlers(): CanvasCommandHandlers {
  return {
    focusStage: vi.fn(),
    insertPanelAfter: vi.fn(),
    deletePanel: vi.fn(),
    reorderPanel: vi.fn(),
    generatePanelImage: vi.fn(),
    regeneratePanelImage: vi.fn(),
    generatePanelVideo: vi.fn(),
    generateAllVideos: vi.fn(),
    exportFinalVideo: vi.fn(),
  }
}

describe('canvas command registry', () => {
  it('routes panel insert commands with explicit storyboard, panel, and user input', async () => {
    const handlers = createHandlers()

    await executeCanvasCommand({
      type: 'insert_panel_after',
      storyboardId: 'storyboard-1',
      panelId: 'panel-3',
      userInput: 'add a close-up reaction shot',
    }, handlers)

    expect(handlers.insertPanelAfter).toHaveBeenCalledWith({
      storyboardId: 'storyboard-1',
      panelId: 'panel-3',
      userInput: 'add a close-up reaction shot',
    })
    expect(handlers.deletePanel).not.toHaveBeenCalled()
  })

  it('routes video commands by business identity without screen coordinates', async () => {
    const handlers = createHandlers()

    await executeCanvasCommand({
      type: 'generate_panel_video',
      storyboardId: 'storyboard-2',
      panelIndex: 4,
      panelId: 'panel-9',
    }, handlers)

    expect(handlers.generatePanelVideo).toHaveBeenCalledWith({
      storyboardId: 'storyboard-2',
      panelIndex: 4,
      panelId: 'panel-9',
    })
  })

  it('routes stage focus as a UI command without mutating business order', async () => {
    const handlers = createHandlers()

    await executeCanvasCommand({
      type: 'focus_stage',
      stageId: 'storyboard',
    }, handlers)

    expect(handlers.focusStage).toHaveBeenCalledWith('storyboard')
    expect(handlers.reorderPanel).not.toHaveBeenCalled()
  })
})
