import type { WorkspaceProjectEntryMode } from '@/lib/workspace/project-mode'

export type WorkspaceStarterTemplate = {
  id: string
  mode: WorkspaceProjectEntryMode
  titleKey: string
  descriptionKey: string
}

const STARTER_TEMPLATES: readonly WorkspaceStarterTemplate[] = [
  {
    id: 'story-cinematic-short',
    mode: 'story',
    titleKey: 'starterTemplates.story.cinematicShort.title',
    descriptionKey: 'starterTemplates.story.cinematicShort.desc',
  },
  {
    id: 'story-social-ad',
    mode: 'story',
    titleKey: 'starterTemplates.story.socialAd.title',
    descriptionKey: 'starterTemplates.story.socialAd.desc',
  },
  {
    id: 'story-dialogue-drama',
    mode: 'story',
    titleKey: 'starterTemplates.story.dialogueDrama.title',
    descriptionKey: 'starterTemplates.story.dialogueDrama.desc',
  },
  {
    id: 'manga-action-battle',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.actionBattle.title',
    descriptionKey: 'starterTemplates.manga.actionBattle.desc',
  },
  {
    id: 'manga-romance-school',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.romanceSchool.title',
    descriptionKey: 'starterTemplates.manga.romanceSchool.desc',
  },
  {
    id: 'manga-fantasy-quest',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.fantasyQuest.title',
    descriptionKey: 'starterTemplates.manga.fantasyQuest.desc',
  },
  {
    id: 'manga-comedy-4koma',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.comedy4Koma.title',
    descriptionKey: 'starterTemplates.manga.comedy4Koma.desc',
  },
]

export function getStarterTemplatesByMode(mode: WorkspaceProjectEntryMode): WorkspaceStarterTemplate[] {
  return STARTER_TEMPLATES.filter((template) => template.mode === mode)
}

export function buildStarterProjectName(prefix: string): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${prefix} ${mm}-${dd}`
}
