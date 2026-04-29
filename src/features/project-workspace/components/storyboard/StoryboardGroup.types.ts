import type { ProjectStoryboard, ProjectClip, ProjectPanel } from '@/types/project'
import type { StoryboardPanel } from './hooks/useStoryboardState'
import type { PanelEditData } from '../PanelEditForm'
import type { VariantData, VariantOptions } from './hooks/usePanelVariant'
import type { PanelSaveState } from './hooks/usePanelCrudActions'

export interface StoryboardGroupProps {
  storyboard: ProjectStoryboard
  clip: ProjectClip | undefined
  sbIndex: number
  totalStoryboards: number
  textPanels: StoryboardPanel[]
  storyboardStartIndex: number
  videoRatio: string
  isExpanded: boolean
  isSubmittingStoryboardTask: boolean
  isSelectingCandidate: boolean
  isSubmittingStoryboardTextTask: boolean
  hasAnyImage: boolean
  failedError: string | null
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  copyingPanelIds: Set<string>
  saveStateByPanel: Record<string, PanelSaveState>
  hasUnsavedByPanel: Set<string>
  modifyingPanels: Set<string>
  submittingPanelImageIds: Set<string>

  onToggleExpand: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRegenerateText: () => void
  onAddPanel: () => void
  onCopyStoryboard: () => void
  onDeleteStoryboard: () => void
  onGenerateAllIndividually: () => void
  onPreviewImage: (url: string) => void
  onCloseError: () => void
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onPanelCopy: (panelId: string) => void
  onPanelDelete: (panelId: string) => void
  onOpenCharacterPicker: (panelId: string) => void
  onOpenLocationPicker: (panelId: string) => void
  onRemoveCharacter: (panel: StoryboardPanel, index: number) => void
  onRemoveLocation: (panel: StoryboardPanel) => void
  onRetryPanelSave: (panelId: string) => void
  getReferencePanelOptions: (panelId: string) => Array<{
    panelId: string
    label: string
    imageUrl: string
  }>
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean, referencePanelIds?: string[], extraImageUrls?: string[]) => void
  onOpenEditModal: (panelIndex: number) => void
  onOpenAIDataModal: (panelIndex: number) => void
  getPanelCandidates: (panel: ProjectPanel) => { candidates: string[]; selectedIndex: number } | null
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void

  formatClipTitle: (clip: ProjectClip | undefined) => string
  movingClipId: string | null
  isCopyingStoryboard: boolean
  isCopyingAnyStoryboard: boolean
  onInsertPanel: (storyboardId: string, insertAfterPanelId: string, userInput: string) => Promise<void>
  insertingAfterPanelId: string | null
  projectId: string
  episodeId: string
  onPanelVariant: (
    sourcePanelId: string,
    storyboardId: string,
    insertAfterPanelId: string,
    variant: VariantData,
    options: VariantOptions,
  ) => Promise<void>
  submittingVariantPanelId: string | null
}
