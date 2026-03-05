'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { AudioTrack, AudioTrackType, BGMTrack, SFXTrack, BGMGenre, BGMMood, SFXCategory } from '@/types/audio'

// =====================================================
// Track Row Component
// =====================================================

interface TrackRowProps {
  track: AudioTrack
  onUpdate: (id: string, updates: Partial<AudioTrack>) => void
  onRemove: (id: string) => void
  onMute: (id: string) => void
  onUnmute: (id: string) => void
  onSolo: (id: string) => void
}

const TRACK_TYPE_COLORS: Record<AudioTrackType, string> = {
  bgm: 'glass-chip-info',
  sfx: 'glass-chip-warning',
  voice: 'glass-chip-success',
  ambient: 'glass-chip-neutral',
}

function TrackRow({ track, onUpdate, onRemove, onMute, onUnmute, onSolo }: TrackRowProps) {
  const t = useTranslations('audioMixer')

  const typeLabel = t(`trackType.${track.type}`)

  return (
    <div className="glass-list-row group" role="listitem" aria-label={`${typeLabel}: ${track.name}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`glass-chip ${TRACK_TYPE_COLORS[track.type]} text-[10px] shrink-0`}>
          {typeLabel}
        </span>
        <span className="text-sm font-medium text-[var(--glass-text-primary)] truncate">
          {track.name}
        </span>
        <span className="text-[11px] text-[var(--glass-text-tertiary)] shrink-0">
          {formatDuration(track.duration)}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5 w-24">
          <AppIcon name="audioWave" className="w-3 h-3 text-[var(--glass-text-tertiary)]" aria-hidden="true" />
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(track.volume * 100)}
            onChange={(e) => onUpdate(track.id, { volume: parseInt(e.target.value) / 100 })}
            className="w-full h-1 bg-[var(--glass-stroke-base)] rounded-full appearance-none cursor-pointer accent-[var(--glass-accent-from)]"
            aria-label={t('volumeFor', { name: track.name })}
          />
          <span className="text-[10px] text-[var(--glass-text-tertiary)] w-7 text-right" aria-hidden="true">
            {Math.round(track.volume * 100)}%
          </span>
        </div>

        <button
          type="button"
          onClick={() => track.muted ? onUnmute(track.id) : onMute(track.id)}
          className={`glass-icon-btn-sm ${track.muted ? 'text-[var(--glass-tone-danger-fg)]' : ''}`}
          aria-label={track.muted ? t('unmute') : t('mute')}
          aria-pressed={track.muted}
        >
          <AppIcon name={track.muted ? 'volumeOff' : 'audioWave'} className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onSolo(track.id)}
          className="glass-icon-btn-sm"
          aria-label={t('solo')}
        >
          S
        </button>

        <button
          type="button"
          onClick={() => onUpdate(track.id, { loop: !track.loop })}
          className={`glass-icon-btn-sm text-[11px] font-bold ${track.loop ? 'text-[var(--glass-tone-info-fg)]' : ''}`}
          aria-label={track.loop ? t('disableLoop') : t('enableLoop')}
          aria-pressed={track.loop}
        >
          <AppIcon name="refresh" className="w-3 h-3" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onRemove(track.id)}
          className="glass-icon-btn-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--glass-tone-danger-fg)]"
          aria-label={t('removeTrack')}
        >
          <AppIcon name="trash" className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// =====================================================
// Add Track Form
// =====================================================

function AddTrackForm({
  onAddBGM,
  onAddSFX,
  onClose,
}: {
  onAddBGM: (bgm: Omit<BGMTrack, 'id' | 'type' | 'muted'>) => void
  onAddSFX: (sfx: Omit<SFXTrack, 'id' | 'type' | 'muted'>) => void
  onClose: () => void
}) {
  const t = useTranslations('audioMixer')
  const [tab, setTab] = useState<'bgm' | 'sfx'>('bgm')
  const [name, setName] = useState('')
  const [genre, setGenre] = useState<BGMGenre>('dramatic')
  const [mood, setMood] = useState<BGMMood>('tense')
  const [category, setCategory] = useState<SFXCategory>('nature')
  const [volume, setVolume] = useState(70)

  const handleAdd = () => {
    if (!name.trim()) return

    if (tab === 'bgm') {
      onAddBGM({
        name: name.trim(),
        audioUrl: '',
        duration: 60,
        volume: volume / 100,
        fadeInDuration: 2,
        fadeOutDuration: 2,
        loop: true,
        startTime: 0,
        endTime: 0,
        genre,
        mood,
        tempo: 'moderate',
        intensity: 5,
        linkedClipIds: [],
      })
    } else {
      onAddSFX({
        name: name.trim(),
        audioUrl: '',
        duration: 3,
        volume: volume / 100,
        fadeInDuration: 0,
        fadeOutDuration: 0.5,
        loop: false,
        startTime: 0,
        endTime: 0,
        category,
        triggerTime: 0,
      })
    }

    setName('')
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) {
      handleAdd()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-4" role="form" aria-label={t('addTrackForm')}>
      <div className="glass-segmented mb-4" role="tablist" aria-label={t('trackTypeSelect')}>
        <button
          type="button"
          role="tab"
          className="glass-segmented-item"
          data-active={tab === 'bgm'}
          onClick={() => setTab('bgm')}
          aria-selected={tab === 'bgm'}
        >
          BGM
        </button>
        <button
          type="button"
          role="tab"
          className="glass-segmented-item"
          data-active={tab === 'sfx'}
          onClick={() => setTab('sfx')}
          aria-selected={tab === 'sfx'}
        >
          SFX
        </button>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tab === 'bgm' ? t('bgmNamePlaceholder') : t('sfxNamePlaceholder')}
          className="glass-input-base px-3 py-2 text-sm"
          aria-label={t('trackName')}
        />

        {tab === 'bgm' ? (
          <div className="grid grid-cols-2 gap-3">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as BGMGenre)}
              className="glass-select-base px-3 py-2 text-sm"
              aria-label={t('genre')}
            >
              {(['dramatic', 'romantic', 'action', 'mysterious', 'comedy', 'sad', 'epic', 'calm', 'horror', 'fantasy'] as BGMGenre[]).map((g) => (
                <option key={g} value={g}>{t(`genres.${g}`)}</option>
              ))}
            </select>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value as BGMMood)}
              className="glass-select-base px-3 py-2 text-sm"
              aria-label={t('mood')}
            >
              {(['happy', 'sad', 'tense', 'peaceful', 'exciting', 'melancholic', 'dark', 'uplifting'] as BGMMood[]).map((m) => (
                <option key={m} value={m}>{t(`moods.${m}`)}</option>
              ))}
            </select>
          </div>
        ) : (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SFXCategory)}
            className="glass-select-base px-3 py-2 text-sm"
            aria-label={t('category')}
          >
            {(['nature', 'urban', 'action', 'emotion', 'transition', 'environment', 'magic', 'ui'] as SFXCategory[]).map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--glass-text-tertiary)]">{t('volume')}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            className="flex-1 h-1 bg-[var(--glass-stroke-base)] rounded-full appearance-none cursor-pointer accent-[var(--glass-accent-from)]"
            aria-label={t('volume')}
          />
          <span className="text-xs text-[var(--glass-text-tertiary)] w-8 text-right">{volume}%</span>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="glass-btn-base glass-btn-ghost rounded-lg px-3 py-1.5 text-xs"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!name.trim()}
            className="glass-btn-base glass-btn-primary rounded-lg px-4 py-1.5 text-xs"
          >
            {t('addType', { type: tab === 'bgm' ? 'BGM' : 'SFX' })}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Main Audio Mixer Panel
// =====================================================

interface AudioMixerPanelProps {
  allTracks: AudioTrack[]
  masterVolume: number
  trackCount: number
  isPlaying: boolean
  currentTime: number
  totalDuration: number
  onAddBGM: (bgm: Omit<BGMTrack, 'id' | 'type' | 'muted'>) => void
  onAddSFX: (sfx: Omit<SFXTrack, 'id' | 'type' | 'muted'>) => void
  onUpdateTrack: (id: string, updates: Partial<AudioTrack>) => void
  onRemoveTrack: (id: string) => void
  onMuteTrack: (id: string) => void
  onUnmuteTrack: (id: string) => void
  onSoloTrack: (id: string) => void
  onSetMasterVolume: (volume: number) => void
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSeek: (time: number) => void
}

export default function AudioMixerPanel({
  allTracks,
  masterVolume,
  trackCount,
  isPlaying,
  currentTime,
  totalDuration,
  onAddBGM,
  onAddSFX,
  onUpdateTrack,
  onRemoveTrack,
  onMuteTrack,
  onUnmuteTrack,
  onSoloTrack,
  onSetMasterVolume,
  onPlay,
  onPause,
  onStop,
  onSeek,
}: AudioMixerPanelProps) {
  const t = useTranslations('audioMixer')
  const [showAddForm, setShowAddForm] = useState(false)

  return (
    <div className="glass-surface rounded-2xl p-5" role="region" aria-label={t('title')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <AppIcon name="audioWave" className="w-5 h-5 text-[var(--glass-accent-from)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('title')}</h3>
          <span className="glass-chip glass-chip-neutral text-[10px]">{t('trackCount', { count: trackCount })}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="glass-btn-base glass-btn-soft rounded-lg px-3 py-1.5 text-xs"
          aria-expanded={showAddForm}
          aria-label={t('addTrack')}
        >
          <AppIcon name="plus" className="w-3.5 h-3.5" aria-hidden="true" />
          {t('addTrack')}
        </button>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-3 mb-4 p-3 glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)]" role="toolbar" aria-label={t('playbackControls')}>
        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          className="glass-btn-base glass-btn-primary rounded-full w-8 h-8 p-0"
          aria-label={isPlaying ? t('pause') : t('play')}
        >
          <AppIcon name={isPlaying ? 'pause' : 'play'} className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onStop}
          className="glass-btn-base glass-btn-ghost rounded-full w-8 h-8 p-0"
          aria-label={t('stop')}
        >
          <AppIcon name="pauseSolid" className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* Timeline scrubber */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] text-[var(--glass-text-tertiary)] w-10 text-right font-mono" aria-hidden="true">
            {formatDuration(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={Math.max(1, totalDuration * 1000)}
            value={currentTime * 1000}
            onChange={(e) => onSeek(parseInt(e.target.value) / 1000)}
            className="flex-1 h-1 bg-[var(--glass-stroke-base)] rounded-full appearance-none cursor-pointer accent-[var(--glass-accent-from)]"
            aria-label={t('seekPosition')}
            aria-valuetext={`${formatDuration(currentTime)} / ${formatDuration(totalDuration)}`}
          />
          <span className="text-[10px] text-[var(--glass-text-tertiary)] w-10 font-mono" aria-hidden="true">
            {formatDuration(totalDuration)}
          </span>
        </div>

        {/* Master volume */}
        <div className="flex items-center gap-1.5 w-20">
          <AppIcon name="audioWave" className="w-3 h-3 text-[var(--glass-text-tertiary)]" aria-hidden="true" />
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(masterVolume * 100)}
            onChange={(e) => onSetMasterVolume(parseInt(e.target.value) / 100)}
            className="flex-1 h-1 bg-[var(--glass-stroke-base)] rounded-full appearance-none cursor-pointer accent-[var(--glass-accent-from)]"
            aria-label={t('masterVolume')}
          />
        </div>
      </div>

      {/* Add Track Form */}
      {showAddForm && (
        <div className="mb-4">
          <AddTrackForm
            onAddBGM={onAddBGM}
            onAddSFX={onAddSFX}
            onClose={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Track List */}
      <div className="space-y-1.5" role="list" aria-label={t('trackList')}>
        {allTracks.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--glass-text-tertiary)]">
            {t('emptyState')}
          </div>
        ) : (
          allTracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onUpdate={onUpdateTrack}
              onRemove={onRemoveTrack}
              onMute={onMuteTrack}
              onUnmute={onUnmuteTrack}
              onSolo={onSoloTrack}
            />
          ))
        )}
      </div>
    </div>
  )
}

// =====================================================
// Utilities
// =====================================================

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
