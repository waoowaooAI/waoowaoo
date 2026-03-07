import type { Project } from '@/types/project'
import type {
  NovelPromotionClip,
  NovelPromotionShot,
  NovelPromotionStoryboard,
} from '@/types/project'

export interface Episode {
  id: string
  episodeNumber: number
  name: string
  description?: string | null
  novelText?: string | null
  audioUrl?: string | null
  srtContent?: string | null
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
  shots?: NovelPromotionShot[]
  voiceLines?: unknown[]
  createdAt: string
}

export interface NovelPromotionWorkspaceProps {
  project: Project
  projectId: string
  episodeId?: string
  episode?: Episode | null
  viewMode?: 'global-assets' | 'episode'
  urlStage?: string | null
  onStageChange?: (stage: string) => void
  episodes?: Episode[]
  onEpisodeSelect?: (episodeId: string) => void
  onEpisodeCreate?: () => void
  onEpisodeRename?: (episodeId: string, newName: string) => void
  onEpisodeDelete?: (episodeId: string) => void
}
