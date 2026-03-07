import type { PanelEditData } from '../../PanelEditForm'
import type { StoryboardPanel } from './useStoryboardState'

export interface StoryboardPanelUpdateContract {
  panelId: string
  panel: StoryboardPanel
  updates: Partial<PanelEditData>
}
