import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import {
  parseImagePrompt,
  type LocationAssetWithImages,
  type PromptStageRuntime,
} from './hooks/usePromptStageActions'

interface PromptListCardViewProps {
  runtime: PromptStageRuntime
}
export default function PromptListCardView({ runtime }: PromptListCardViewProps) {
  const t = useTranslations('storyboard')
  const tCommon = useTranslations('common')

  const {
    shots,
    onGenerateImage,
    isBatchSubmitting,
    assetLibraryCharacters,
    assetLibraryLocations,
    styleLabel,
    editingPrompt,
    editValue,
    aiModifyInstruction,
    selectedAssets,
    showAssetPicker,
    aiModifyingShots,
    textareaRef,
    shotExtraAssets,
    getGenerateButtonToneClass,
    getShotRunningState,
    isShotTaskRunning,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleModifyInstructionChange,
    handleSelectAsset,
    handleAiModify,
    handleEditValueChange,
    handleRemoveSelectedAsset,
    setPreviewImage,
  } = runtime

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {shots.map((shot) => {
        const shotRunningState = getShotRunningState(shot)
        const isEditing = editingPrompt?.shotId === shot.id && editingPrompt?.field === 'imagePrompt'
        const promptContent = shot.imagePrompt ? parseImagePrompt(shot.imagePrompt).content : ''

        return (
          <div key={shot.id} className="card-base overflow-hidden">
            <div className="aspect-video bg-[var(--glass-bg-muted)] flex items-center justify-center relative">
              {shot.imageUrl ? (
                <MediaImageWithLoading
                  src={shot.imageUrl}
                  alt={`${t('panel.shot')}${shot.shotId}`}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPreviewImage(shot.imageUrl)}
                />
              ) : (
                <AppIcon name="video" className="w-16 h-16 text-[var(--glass-text-tertiary)]" />
              )}
              <div className="absolute top-2 left-2 bg-[var(--glass-overlay)] text-white px-2 py-1 rounded text-xs font-medium">
                #{shot.shotId}
              </div>
              {shot.imageUrl && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onGenerateImage(shot.id, shotExtraAssets[shot.id])
                  }}
                  disabled={isBatchSubmitting}
                  className="absolute top-2 right-2 bg-[var(--glass-overlay)] hover:bg-[var(--glass-text-primary)] text-white p-2 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed z-10"
                  title={t('panel.regenerateImage')}
                >
                  <AppIcon name="refresh" className="w-4 h-4" />
                </button>
              )}
              {isShotTaskRunning(shot) && <TaskStatusOverlay state={shotRunningState} />}
            </div>

            <div className="p-5 space-y-4">
              {shot.imagePrompt && (
                <div className="space-y-2 border-b pb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded-md text-sm font-medium">
                      <AppIcon name="imageEdit" className="w-4 h-4" />
                      {styleLabel}
                    </span>
                  </div>

                  <div className="text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[var(--glass-text-primary)] text-base">{t('prompts.imagePrompt')}</span>
                      {!isEditing && (
                        <button
                          onClick={() => handleStartEdit(shot.id, 'imagePrompt', shot.imagePrompt || '')}
                          className="text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-text-primary)] p-1.5 hover:bg-[var(--glass-tone-info-bg)] rounded transition-colors"
                          title={t('prompts.imagePrompt')}
                        >
                          <AppIcon name="edit" className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('prompts.currentPrompt')}</label>
                          <textarea
                            value={editValue}
                            onChange={(event) => handleEditValueChange(event.target.value)}
                            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)] text-sm resize-none"
                            rows={4}
                            autoFocus
                          />
                        </div>

                        <div className="border-t pt-3">
                          <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">
                            {t('prompts.aiInstruction')} <span className="text-[var(--glass-text-tertiary)]">{t('prompts.supportReference')}</span>
                          </label>
                          <div className="relative">
                            <textarea
                              ref={textareaRef}
                              value={aiModifyInstruction}
                              onChange={(event) => handleModifyInstructionChange(event.target.value)}
                              placeholder={t('prompts.instructionPlaceholder')}
                              className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)] text-sm resize-none"
                              rows={2}
                            />

                            {showAssetPicker && (
                              <div className="absolute z-10 mt-1 w-full bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-strong)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                <div className="p-2">
                                  <div className="text-xs font-medium text-[var(--glass-text-tertiary)] mb-2">{t('prompts.selectAsset')}</div>

                                  {assetLibraryCharacters.length > 0 && (
                                    <div className="mb-2">
                                      <div className="text-xs text-[var(--glass-text-tertiary)] mb-1">{t('prompts.character')}</div>
                                      {assetLibraryCharacters.map((character) => (
                                        <button
                                          key={character.id}
                                          onClick={() => handleSelectAsset({ id: character.id, name: character.name, description: character.description, type: 'character' })}
                                          className="w-full text-left px-2 py-1.5 hover:bg-[var(--glass-tone-info-bg)] rounded text-sm"
                                        >
                                          {character.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  {assetLibraryLocations.length > 0 && (
                                    <div>
                                      <div className="text-xs text-[var(--glass-text-tertiary)] mb-1">{t('prompts.location')}</div>
                                      {assetLibraryLocations.map((location) => {
                                        const locationAsset = location as LocationAssetWithImages
                                        const selectedImage = locationAsset.selectedImageId
                                          ? locationAsset.images?.find((image) => image.id === locationAsset.selectedImageId)
                                          : locationAsset.images?.find((image) => image.isSelected) || locationAsset.images?.find((image) => image.imageUrl) || locationAsset.images?.[0]
                                        const description = selectedImage?.description || locationAsset.description || ''

                                        return (
                                          <button
                                            key={location.id}
                                            onClick={() => handleSelectAsset({ id: location.id, name: location.name, description, type: 'location' })}
                                            className="w-full text-left px-2 py-1.5 hover:bg-[var(--glass-tone-info-bg)] rounded text-sm"
                                          >
                                            {location.name}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {selectedAssets.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 p-2.5 bg-[var(--glass-bg-muted)]/50 rounded-lg border border-[var(--glass-stroke-base)]">
                              <div className="text-xs text-[var(--glass-text-tertiary)] font-medium w-full mb-1">{t('prompts.referencedAssets')}</div>
                              {selectedAssets.map((asset, index) => (
                                <span
                                  key={asset.id}
                                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${asset.type === 'character'
                                    ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] border border-[var(--glass-stroke-strong)] hover:bg-[var(--glass-bg-muted)] hover:border-[var(--glass-stroke-focus)]'
                                    : 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] border border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)] hover:border-[var(--glass-stroke-focus)]'
                                    }`}
                                >
                                  <span>{asset.name}</span>
                                  <button
                                    onClick={() => handleRemoveSelectedAsset(index, asset.name)}
                                    className="ml-0.5 hover:bg-[var(--glass-bg-surface-strong)] rounded p-0.5 transition-colors"
                                    title={t('prompts.removeAsset')}
                                  >
                                    <AppIcon name="closeSolid" className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <button
                            onClick={handleAiModify}
                            disabled={editingPrompt ? aiModifyingShots.has(editingPrompt.shotId) || !aiModifyInstruction.trim() : true}
                            className="glass-btn-base glass-btn-primary mt-2 w-full px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title={t('prompts.aiModifyTip')}
                          >
                            {editingPrompt && aiModifyingShots.has(editingPrompt.shotId) ? (
                              <TaskStatusInline
                                state={resolveTaskPresentationState({ phase: 'processing', intent: 'modify', resource: 'text', hasOutput: true })}
                                className="text-white [&>span]:text-white [&_svg]:text-white"
                              />
                            ) : (
                              t('prompts.aiModify')
                            )}
                          </button>
                        </div>

                        <div className="flex gap-2 pt-2 border-t">
                          <button
                            onClick={handleSaveEdit}
                            className="flex-1 px-4 py-2 bg-[var(--glass-accent-from)] text-white rounded-lg text-sm font-medium hover:bg-[var(--glass-accent-to)] transition-colors"
                          >
                            {t('prompts.save')}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="flex-1 px-4 py-2 bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--glass-bg-muted)] transition-colors"
                          >
                            {tCommon('cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[var(--glass-text-secondary)] leading-relaxed">{promptContent}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--glass-text-tertiary)] font-medium">SRT:</span>
                  <span className="text-[var(--glass-text-primary)]">{shot.srtStart}-{shot.srtEnd}</span>
                  <span className="text-[var(--glass-text-tertiary)]">({shot.srtDuration?.toFixed(1)}s)</span>
                </div>
                {shot.scale && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--glass-text-tertiary)] font-medium">{t('panel.shotType')}</span>
                    <span className="text-[var(--glass-text-primary)]">{shot.scale}</span>
                  </div>
                )}
                {shot.locations && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--glass-text-tertiary)] font-medium">{t('panel.location')}</span>
                    <span className="text-[var(--glass-text-primary)]">{shot.locations}</span>
                  </div>
                )}
                {shot.module && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--glass-text-tertiary)] font-medium">{t('panel.mode')}</span>
                    <span className="text-[var(--glass-text-primary)]">{shot.module}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => onGenerateImage(shot.id, shotExtraAssets[shot.id])}
                disabled={isShotTaskRunning(shot) || isBatchSubmitting}
                className={`glass-btn-base w-full py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${getGenerateButtonToneClass(shot)}`}
              >
                {shot.imageUrl ? t('group.hasSynced') : isShotTaskRunning(shot) ? (
                  <TaskStatusInline state={shotRunningState} className="justify-center text-white [&>span]:text-white [&_svg]:text-white" />
                ) : t('assets.location.generateImage')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
