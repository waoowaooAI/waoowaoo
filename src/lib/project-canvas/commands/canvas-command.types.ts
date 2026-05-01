export type CanvasCommand =
  | { readonly type: 'focus_stage'; readonly stageId: 'story' | 'script' | 'storyboard' | 'video' | 'final' }
  | { readonly type: 'insert_panel_after'; readonly storyboardId: string; readonly panelId: string; readonly userInput: string }
  | { readonly type: 'delete_panel'; readonly storyboardId: string; readonly panelId: string }
  | { readonly type: 'reorder_panel'; readonly storyboardId: string; readonly sourcePanelId: string; readonly targetPanelId: string }
  | { readonly type: 'generate_panel_image'; readonly panelId: string }
  | { readonly type: 'regenerate_panel_image'; readonly panelId: string; readonly count?: number }
  | { readonly type: 'generate_panel_video'; readonly storyboardId: string; readonly panelIndex: number; readonly panelId?: string }
  | { readonly type: 'generate_all_videos' }
  | { readonly type: 'export_final_video' }

export type CanvasCommandType = CanvasCommand['type']
