import type { CanvasCommand } from './canvas-command.types'

export interface CanvasCommandHandlers {
  readonly focusStage: (stageId: Extract<CanvasCommand, { type: 'focus_stage' }>['stageId']) => Promise<void> | void
  readonly insertPanelAfter: (input: {
    readonly storyboardId: string
    readonly panelId: string
    readonly userInput: string
  }) => Promise<void> | void
  readonly deletePanel: (input: {
    readonly storyboardId: string
    readonly panelId: string
  }) => Promise<void> | void
  readonly reorderPanel: (input: {
    readonly storyboardId: string
    readonly sourcePanelId: string
    readonly targetPanelId: string
  }) => Promise<void> | void
  readonly generatePanelImage: (panelId: string) => Promise<void> | void
  readonly regeneratePanelImage: (input: {
    readonly panelId: string
    readonly count?: number
  }) => Promise<void> | void
  readonly generatePanelVideo: (input: {
    readonly storyboardId: string
    readonly panelIndex: number
    readonly panelId?: string
  }) => Promise<void> | void
  readonly generateAllVideos: () => Promise<void> | void
  readonly exportFinalVideo: () => Promise<void> | void
}

export async function executeCanvasCommand(
  command: CanvasCommand,
  handlers: CanvasCommandHandlers,
): Promise<void> {
  switch (command.type) {
    case 'focus_stage':
      await handlers.focusStage(command.stageId)
      return
    case 'insert_panel_after':
      await handlers.insertPanelAfter({
        storyboardId: command.storyboardId,
        panelId: command.panelId,
        userInput: command.userInput,
      })
      return
    case 'delete_panel':
      await handlers.deletePanel({
        storyboardId: command.storyboardId,
        panelId: command.panelId,
      })
      return
    case 'reorder_panel':
      await handlers.reorderPanel({
        storyboardId: command.storyboardId,
        sourcePanelId: command.sourcePanelId,
        targetPanelId: command.targetPanelId,
      })
      return
    case 'generate_panel_image':
      await handlers.generatePanelImage(command.panelId)
      return
    case 'regenerate_panel_image':
      await handlers.regeneratePanelImage({
        panelId: command.panelId,
        count: command.count,
      })
      return
    case 'generate_panel_video':
      await handlers.generatePanelVideo({
        storyboardId: command.storyboardId,
        panelIndex: command.panelIndex,
        panelId: command.panelId,
      })
      return
    case 'generate_all_videos':
      await handlers.generateAllVideos()
      return
    case 'export_final_video':
      await handlers.exportFinalVideo()
      return
  }
}
