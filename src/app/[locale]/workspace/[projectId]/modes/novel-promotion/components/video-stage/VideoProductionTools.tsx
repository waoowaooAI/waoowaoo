'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import AudioMixerPanel from '@/components/audio/AudioMixerPanel'
import TimelineEditor from '@/components/timeline/TimelineEditor'
import { useAudioMix } from '@/lib/audio/useAudioMix'
import { useTimeline } from '@/lib/timeline/useTimeline'

interface VideoProductionToolsProps {
  projectId: string
  episodeId: string
}

type ActiveTab = 'timeline' | 'audio'

export default function VideoProductionTools({
  projectId,
  episodeId,
}: VideoProductionToolsProps) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline')

  const audio = useAudioMix(projectId, episodeId)
  const timeline = useTimeline(projectId, episodeId)

  if (!expanded) {
    return (
      <div className="mx-auto max-w-7xl px-4 mb-6">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full glass-surface rounded-2xl p-3 flex items-center justify-center gap-2 text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] transition-colors"
        >
          <AppIcon name="film" className="w-4 h-4" />
          <span>Production Tools — Timeline & Audio Mixer</span>
          <AppIcon name="chevronDown" className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 mb-6 space-y-3">
      {/* Tab header */}
      <div className="glass-surface rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-stroke-base)]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'timeline'
                  ? 'bg-[var(--glass-accent-from)] text-white'
                  : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <AppIcon name="film" className="w-3.5 h-3.5" />
                Timeline
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'audio'
                  ? 'bg-[var(--glass-accent-from)] text-white'
                  : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <AppIcon name="audioWave" className="w-3.5 h-3.5" />
                Audio Mixer
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="glass-icon-btn-sm"
            title="Collapse"
          >
            <AppIcon name="chevronDown" className="w-4 h-4 rotate-180" />
          </button>
        </div>

        {/* Tab content */}
        <div className="p-0">
          {activeTab === 'timeline' && (
            <TimelineEditor
              tracks={timeline.state.tracks}
              totalDuration={timeline.state.totalDuration}
              currentTime={timeline.state.currentTime}
              zoom={timeline.state.zoom}
              isPlaying={timeline.state.isPlaying}
              selectedItemIds={timeline.state.selectedItemIds}
              snapEnabled={timeline.state.snapEnabled}
              onSeek={timeline.setCurrentTime}
              onSelectItems={timeline.selectItems}
              onMoveItem={timeline.moveItem}
              onResizeItem={timeline.resizeItem}
              onTogglePlay={timeline.togglePlay}
              onZoomIn={timeline.zoomIn}
              onZoomOut={timeline.zoomOut}
              onZoomToFit={timeline.zoomToFit}
              onToggleSnap={timeline.toggleSnap}
              onLockTrack={timeline.lockTrack}
              onUnlockTrack={timeline.unlockTrack}
              onMuteTrack={timeline.muteTrack}
              onUnmuteTrack={timeline.unmuteTrack}
            />
          )}
        </div>
      </div>

      {activeTab === 'audio' && (
        <AudioMixerPanel
          allTracks={audio.allTracks}
          masterVolume={audio.mix.masterVolume}
          trackCount={audio.trackCount}
          isPlaying={audio.playback.isPlaying}
          currentTime={audio.playback.currentTime}
          totalDuration={audio.playback.duration}
          onAddBGM={audio.addBGM}
          onAddSFX={audio.addSFX}
          onUpdateTrack={audio.updateTrack}
          onRemoveTrack={audio.removeTrack}
          onMuteTrack={audio.muteTrack}
          onUnmuteTrack={audio.unmuteTrack}
          onSoloTrack={audio.soloTrack}
          onSetMasterVolume={audio.setMasterVolume}
          onPlay={audio.play}
          onPause={audio.pause}
          onStop={audio.stop}
          onSeek={audio.seek}
        />
      )}
    </div>
  )
}
