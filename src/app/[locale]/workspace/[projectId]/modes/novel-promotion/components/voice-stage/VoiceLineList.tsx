import type { TaskPresentationState } from '@/lib/task/presentation'
import type { VoiceLine } from '@/lib/novel-promotion/stages/voice-stage-runtime/types'
import VoiceLineCard from '../voice/VoiceLineCard'
import EmptyVoiceState from '../voice/EmptyVoiceState'

interface VoiceLineListProps {
  voiceLines: VoiceLine[]
  runningLineIds: Set<string>
  voiceStatusStateByLineId: Map<string, TaskPresentationState>
  playingLineId: string | null
  analyzing: boolean
  getSpeakerVoiceUrl: (speaker: string) => string | null
  onTogglePlayAudio: (lineId: string, audioUrl: string) => void
  onDownloadSingle: (audioUrl: string) => void
  onGenerateLine: (lineId: string) => Promise<void>
  onStartEdit: (line: VoiceLine) => void
  onLocatePanel: (line: VoiceLine) => void
  onDeleteLine: (lineId: string) => Promise<void>
  onDeleteAudio: (lineId: string) => Promise<void>
  onSaveEmotionSettings: (lineId: string, emotionPrompt: string | null, emotionStrength: number) => Promise<void>
  onAnalyze: () => Promise<void>
}

export default function VoiceLineList({
  voiceLines,
  runningLineIds,
  voiceStatusStateByLineId,
  playingLineId,
  analyzing,
  getSpeakerVoiceUrl,
  onTogglePlayAudio,
  onDownloadSingle,
  onGenerateLine,
  onStartEdit,
  onLocatePanel,
  onDeleteLine,
  onDeleteAudio,
  onSaveEmotionSettings,
  onAnalyze,
}: VoiceLineListProps) {
  if (voiceLines.length === 0) {
    return <EmptyVoiceState onAnalyze={onAnalyze} analyzing={analyzing} />
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 px-2 pt-4">
      {voiceLines.map((line) => (
        <VoiceLineCard
          key={line.id}
          line={line}
          isVoiceTaskRunning={runningLineIds.has(line.id)}
          statusState={voiceStatusStateByLineId.get(line.id) || null}
          isPlaying={playingLineId === line.id}
          hasVoice={!!getSpeakerVoiceUrl(line.speaker)}
          onTogglePlay={onTogglePlayAudio}
          onDownload={onDownloadSingle}
          onGenerate={onGenerateLine}
          onEdit={onStartEdit}
          onLocatePanel={onLocatePanel}
          onDelete={onDeleteLine}
          onDeleteAudio={onDeleteAudio}
          onSaveEmotionSettings={onSaveEmotionSettings}
        />
      ))}
    </div>
  )
}
