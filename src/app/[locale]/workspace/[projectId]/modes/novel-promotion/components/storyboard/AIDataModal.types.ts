'use client'

export interface PhotographyCharacter {
  name: string
  screen_position: string
  posture: string
  facing: string
}

export interface PhotographyRules {
  panel_number?: number
  scene_summary: string
  lighting: {
    direction: string
    quality: string
  }
  characters: PhotographyCharacter[]
  depth_of_field: string
  color_tone: string
}

export interface ActingCharacter {
  name: string
  acting: string
}

export interface ActingNotes {
  panel_number?: number
  characters: ActingCharacter[]
}

export interface AIDataSavePayload {
  shotType: string | null
  cameraMove: string | null
  description: string | null
  videoPrompt: string | null
  photographyRules: PhotographyRules | null
  actingNotes: ActingCharacter[] | null
}

export interface AIDataModalProps {
  isOpen: boolean
  onClose: () => void
  syncKey?: string
  panelNumber: number
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: string[]
  videoPrompt: string | null
  photographyRules: PhotographyRules | null
  actingNotes: ActingNotes | ActingCharacter[] | null
  videoRatio: string
  onSave: (data: AIDataSavePayload) => void
}
