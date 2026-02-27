import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import type { VoiceCreationRuntime } from './hooks/useVoiceCreation'

interface VoicePreviewSectionProps {
  runtime: VoiceCreationRuntime
}

export default function VoicePreviewSection({ runtime }: VoicePreviewSectionProps) {
  const {
    mode,
    voiceName,
    voicePrompt,
    previewText,
    isVoiceCreationSubmitting,
    isSaving,
    error,
    generatedVoices,
    selectedIndex,
    playingIndex,
    uploadFile,
    uploadPreviewUrl,
    isUploading,
    isDragging,
    fileInputRef,
    voiceCreationSubmittingState,
    uploadSubmittingState,
    tHub,
    tv,
    tvCreate,
    VOICE_PRESET_KEYS,
    setVoicePrompt,
    setPreviewText,
    setSelectedIndex,
    setUploadFile,
    setUploadPreviewUrl,
    handleGenerate,
    handlePlayVoice,
    handleSaveDesigned,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePlayUpload,
    handleSaveUploaded,
  } = runtime

  return (
    <>
      {mode === 'design' && (
        <>
          <div>
            <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{tv('selectStyle')}</div>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_PRESET_KEYS.map((presetKey, idx) => {
                const prompt = tv(`presetsPrompts.${presetKey}` as Parameters<typeof tv>[0])
                return (
                  <button
                    key={idx}
                    onClick={() => setVoicePrompt(prompt)}
                    className={`glass-btn-base px-2.5 py-1 text-xs rounded-md border transition-all ${voicePrompt === prompt
                      ? 'glass-btn-tone-info border-[var(--glass-stroke-focus)]'
                      : 'glass-btn-soft text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                      }`}
                  >
                    {tv(`presets.${presetKey}` as Parameters<typeof tv>[0])}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-sm text-[var(--glass-text-secondary)] mb-1">{tv('orCustomDescription')}</div>
            <textarea
              value={voicePrompt}
              onChange={(e) => setVoicePrompt(e.target.value)}
              placeholder={tv('describePlaceholder')}
              className="glass-textarea-base w-full px-3 py-2 text-sm resize-none"
              rows={2}
            />
          </div>

          <details className="text-sm">
            <summary className="text-[var(--glass-text-secondary)] cursor-pointer hover:text-[var(--glass-text-primary)]">
              {tv('editPreviewText')}
            </summary>
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder={tv('defaultPreviewText')}
              className="glass-input-base w-full mt-2 px-3 py-2 text-sm"
            />
          </details>

          {generatedVoices.length === 0 && !isVoiceCreationSubmitting && (
            <button
              onClick={handleGenerate}
              disabled={!voicePrompt.trim()}
              className="glass-btn-base glass-btn-primary w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {tv('generate3Schemes')}
            </button>
          )}

          {isVoiceCreationSubmitting && (
            <div className="py-6">
              <TaskStatusInline
                state={voiceCreationSubmittingState}
                className="justify-center text-[var(--glass-text-secondary)] [&>span]:text-[var(--glass-text-secondary)]"
              />
            </div>
          )}

          {generatedVoices.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm text-[var(--glass-text-secondary)]">{tv('selectScheme')}</div>
              <div className="grid grid-cols-3 gap-2">
                {generatedVoices.map((voice, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${selectedIndex === idx
                      ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]'
                      : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                      }`}
                  >
                    <div className="text-sm font-medium text-[var(--glass-text-primary)] mb-2">{tv('schemeN', { n: idx + 1 })}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlayVoice(idx)
                      }}
                      className={`w-10 h-10 mx-auto rounded-full glass-btn-base flex items-center justify-center transition-all ${playingIndex === idx
                        ? 'glass-btn-tone-info animate-pulse'
                        : 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                        }`}
                    >
                      {playingIndex === idx ? (
                        <AppIcon name="pause" className="w-4 h-4" />
                      ) : (
                        <AppIcon name="play" className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={isVoiceCreationSubmitting}
                  className="glass-btn-base glass-btn-secondary flex-1 py-2 rounded-lg text-sm"
                >
                  {tv('regenerate')}
                </button>
                <button
                  onClick={handleSaveDesigned}
                  disabled={selectedIndex === null || isSaving || !voiceName.trim()}
                  className="glass-btn-base glass-btn-tone-success flex-1 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {isSaving ? tHub('modal.adding') : tHub('save')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'upload' && (
        <>
          {!uploadFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging
                ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]'
                : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-bg-muted)]'
                }`}
            >
              <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{tvCreate('dropOrClick')}</div>
              <div className="text-xs text-[var(--glass-text-tertiary)]">{tvCreate('supportedFormats')}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
                className="hidden"
              />
            </div>
          ) : (
            <div className="glass-surface-soft border border-[var(--glass-stroke-base)] rounded-xl p-4">
              <div className="text-sm font-medium text-[var(--glass-text-primary)] truncate">{uploadFile.name}</div>
              <button
                onClick={() => {
                  setUploadFile(null)
                  if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
                  setUploadPreviewUrl(null)
                }}
                className="glass-btn-base glass-btn-soft p-1 mt-2"
              >
                ×
              </button>
              {uploadPreviewUrl && (
                <button
                  onClick={handlePlayUpload}
                  className="glass-btn-base glass-btn-tone-info w-full py-2 rounded-lg text-sm font-medium mt-2"
                >
                  {tvCreate('previewAudio')}
                </button>
              )}
            </div>
          )}

          {uploadFile && (
            <button
              onClick={handleSaveUploaded}
              disabled={isUploading || !voiceName.trim()}
              className="glass-btn-base glass-btn-tone-success w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <TaskStatusInline
                  state={uploadSubmittingState}
                  className="text-white [&>span]:text-white [&_svg]:text-white"
                />
              ) : (
                tHub('save')
              )}
            </button>
          )}
        </>
      )}

      {error && (
        <div className="text-sm text-[var(--glass-tone-danger-fg)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </>
  )
}
