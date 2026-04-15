export interface ShotVariantSuggestion {
  id: number
  title: string
  description: string
  shot_type: string
  camera_move: string
  video_prompt: string
  creative_score: number
}

export interface PanelInfo {
  id: string
  panelNumber: number | null
  description: string | null
  imageUrl: string | null
  storyboardId: string
}
