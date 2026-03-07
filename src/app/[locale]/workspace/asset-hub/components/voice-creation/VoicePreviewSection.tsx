import TaskStatusInline from '@/components/task/TaskStatusInline'
import VoiceDesignGeneratorSection from '@/components/voice/VoiceDesignGeneratorSection'
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
    schemeCount,
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
    tvCreate,
    setVoicePrompt,
    setPreviewText,
    setSchemeCount,
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
        <VoiceDesignGeneratorSection
          voicePrompt={voicePrompt}
          onVoicePromptChange={setVoicePrompt}
          previewText={previewText}
          onPreviewTextChange={setPreviewText}
          schemeCount={schemeCount}
          onSchemeCountChange={setSchemeCount}
          isSubmitting={isVoiceCreationSubmitting}
          submittingState={voiceCreationSubmittingState}
          error={error}
          generatedVoices={generatedVoices}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          playingIndex={playingIndex}
          onPlayVoice={handlePlayVoice}
          onGenerate={() => {
            void handleGenerate()
          }}
          footer={(
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  void handleGenerate()
                }}
                disabled={isVoiceCreationSubmitting}
                className="glass-btn-base glass-btn-secondary flex-1 py-2 rounded-lg text-sm"
              >
                {tHub('regenerate')}
              </button>
              <button
                onClick={() => {
                  void handleSaveDesigned()
                }}
                disabled={selectedIndex === null || isSaving || !voiceName.trim()}
                className="glass-btn-base glass-btn-tone-success flex-1 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSaving ? tHub('modal.adding') : tHub('save')}
              </button>
            </div>
          )}
        />
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

      {mode === 'upload' && error && (
        <div className="text-sm text-[var(--glass-tone-danger-fg)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </>
  )
}
