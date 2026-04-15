export interface SplitEpisode {
  number: number
  title: string
  summary: string
  content: string
  wordCount: number
}

export type WizardStage = 'select' | 'analyzing' | 'preview'

export interface DeleteConfirmState {
  show: boolean
  index: number
  title: string
}
