import { useTranslations } from 'next-intl'
import VoiceStage from '../VoiceStage'
import { AppIcon } from '@/components/ui/icons'

interface VoiceLineSummary {
  audioUrl: string | null
}

interface VideoTimelinePanelProps {
  projectId: string
  episodeId: string
  allVoiceLines: VoiceLineSummary[]
  expanded: boolean
  onToggleExpanded: () => void
  onReloadVoiceLines: () => Promise<void>
  onLocateVoiceLine: (storyboardId: string, panelIndex: number) => void
  onOpenAssetLibraryForCharacter?: (characterId?: string | null) => void
}

export default function VideoTimelinePanel({
  projectId,
  episodeId,
  allVoiceLines,
  expanded,
  onToggleExpanded,
  onReloadVoiceLines,
  onLocateVoiceLine,
  onOpenAssetLibraryForCharacter,
}: VideoTimelinePanelProps) {
  const tVoice = useTranslations('voice')

  return (
    <div className="glass-surface-elevated overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggleExpanded()
          }
        }}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[var(--glass-bg-muted)]/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--glass-accent-from)] rounded-xl flex items-center justify-center shadow-[var(--glass-shadow-md)]">
            <AppIcon name="micOutline" className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-[var(--glass-text-primary)]">{tVoice('title')}</h3>
            <p className="text-sm text-[var(--glass-text-tertiary)]">
              {tVoice('linesCount', { count: allVoiceLines.length })}
              {tVoice('audioGeneratedCount', { count: allVoiceLines.filter((line) => line.audioUrl).length })}
            </p>
          </div>
        </div>
        <AppIcon name="chevronDown" className={`w-5 h-5 text-[var(--glass-text-tertiary)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="py-4">
          <VoiceStage
            projectId={projectId}
            episodeId={episodeId}
            embedded={true}
            onVoiceLinesChanged={onReloadVoiceLines}
            onVoiceLineClick={onLocateVoiceLine}
            onOpenAssetLibraryForCharacter={onOpenAssetLibraryForCharacter}
          />
        </div>
      )}
    </div>
  )
}
