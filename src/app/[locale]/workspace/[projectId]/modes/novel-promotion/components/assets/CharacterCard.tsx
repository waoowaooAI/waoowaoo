'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'

import { useTranslations } from 'next-intl'
/**
 * 角色卡片组件 - 支持多图片选择和音色设置
 * 布局：上面名字+描述，下面三张图片（每张图片有独立的编辑和重新生成按钮）
 */

import { useState, useRef } from 'react'
import { Character, CharacterAppearance } from '@/types/project'
import { shouldShowError } from '@/lib/error-utils'
import VoiceSettings from './VoiceSettings'
import { useUploadProjectCharacterImage } from '@/lib/query/mutations'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import CharacterCardHeader from './character-card/CharacterCardHeader'
import CharacterCardGallery from './character-card/CharacterCardGallery'
import CharacterCardActions from './character-card/CharacterCardActions'
import { AppIcon } from '@/components/ui/icons'

interface CharacterCardProps {
  character: Character
  appearance: CharacterAppearance
  onEdit: () => void
  onDelete: () => void
  onDeleteAppearance?: () => void  // 删除单个形象
  onRegenerate: () => void
  onGenerate: () => void
  onUndo?: () => void  // 撤回到上一版本
  onImageClick: (imageUrl: string) => void
  showDeleteButton: boolean
  appearanceCount?: number  // 该角色的形象数量
  onSelectImage?: (characterId: string, appearanceId: string, imageIndex: number | null) => void
  activeTaskKeys?: Set<string>
  onClearTaskKey?: (key: string) => void
  onImageEdit?: (characterId: string, appearanceId: string, imageIndex: number) => void
  isPrimaryAppearance?: boolean
  primaryAppearanceSelected?: boolean
  projectId: string
  onConfirmSelection?: (characterId: string, appearanceId: string) => void  // 确认选择
  // 音色相关
  onVoiceChange?: (characterId: string, customVoiceUrl?: string) => void
  onVoiceDesign?: (characterId: string, characterName: string) => void  // AI 声音设计
  onVoiceSelectFromHub?: (characterId: string) => void  // 从资产中心选择音色
}

export default function CharacterCard({
  character,
  appearance,
  onEdit,
  onDelete,
  onDeleteAppearance,
  onRegenerate,
  onGenerate,
  onUndo,
  onImageClick,
  showDeleteButton,
  appearanceCount = 1,
  onSelectImage,
  activeTaskKeys = new Set(),
  onImageEdit,
  isPrimaryAppearance = false,
  primaryAppearanceSelected = false,
  projectId,
  onConfirmSelection,
  onVoiceChange,
  onVoiceDesign,
  onVoiceSelectFromHub
}: CharacterCardProps) {
  // 🔥 使用 mutation
  const uploadImage = useUploadProjectCharacterImage(projectId)
  const t = useTranslations('assets')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadIndex, setPendingUploadIndex] = useState<number | undefined>(undefined)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [isConfirmingSelection, setIsConfirmingSelection] = useState(false)

  // 处理删除按钮点击
  const handleDeleteClick = () => {
    if (appearanceCount <= 1) {
      // 只有一个形象，直接删除角色
      onDelete()
    } else {
      // 多个形象，显示菜单
      setShowDeleteMenu(!showDeleteMenu)
    }
  }

  // 触发文件选择
  const triggerUpload = (imageIndex?: number) => {
    setPendingUploadIndex(imageIndex)
    fileInputRef.current?.click()
  }

  // 处理图片上传
  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    const uploadIndex = pendingUploadIndex

    uploadImage.mutate(
      {
        file,
        characterId: character.id,
        appearanceId: appearance.id,
        imageIndex: uploadIndex,
        labelText: `${character.name} - ${appearance.changeReason}`
      },
      {
        onSuccess: () => {
          alert(t('image.uploadSuccess'))
        },
        onError: (error) => {
          if (shouldShowError(error)) {
            alert(t('image.uploadFailed') + ': ' + error.message)
          }
        },
        onSettled: () => {
          setPendingUploadIndex(undefined)
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }
      }
    )
  }

  // 音色设置由 VoiceSettings 组件处理

  // 获取图片数组（已经是数组，不需要 JSON 解析）
  const rawImageUrls = appearance.imageUrls || []
  const imageUrlsWithIndex = rawImageUrls
    .map((url, idx) => ({ url, originalIndex: idx }))
    .filter((item) => !!item.url) as { url: string; originalIndex: number }[]

  const hasMultipleImages = imageUrlsWithIndex.length > 1
  const selectedIndex = appearance.selectedIndex ?? null

  // 🔥 统一图片URL优先级：imageUrl > imageUrls[selectedIndex] > imageUrls[0]
  // 这样确保编辑后的新图片能正确显示
  const currentImageUrl = appearance.imageUrl ||
    (selectedIndex !== null ? rawImageUrls[selectedIndex] : null) ||
    imageUrlsWithIndex[0]?.url

  // 调试日志
  if (!currentImageUrl) {
    _ulogInfo(`[CharacterCard调试] ${character.name}-${appearance.changeReason}:`, {
      imageUrl: appearance.imageUrl,
      imageUrls: appearance.imageUrls,
      rawImageUrls,
      imageUrlsWithIndex,
      currentImageUrl
    })
  }

  const showSelectionMode = hasMultipleImages

  const isImageTaskRunning = (imageIndex: number) => {
    return activeTaskKeys.has(`character-${character.id}-${appearance.appearanceIndex}-${imageIndex}`)
  }

  const isGroupTaskRunning = activeTaskKeys.has(`character-${character.id}-${appearance.appearanceIndex}-group`)

  const isAnyTaskRunning = isGroupTaskRunning || Array.from(activeTaskKeys).some(key =>
    key.startsWith(`character-${character.id}-${appearance.appearanceIndex}`)
  )
  const appearanceTaskRunning = !!appearance.imageTaskRunning
  const appearanceTaskPresentation = appearanceTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: currentImageUrl ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const fallbackRunningPresentation = isAnyTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'regenerate',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const displayTaskPresentation = appearanceTaskPresentation || fallbackRunningPresentation
  const confirmSelectionState = isConfirmingSelection
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const uploadPendingState = uploadImage.isPending
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const isAppearanceTaskRunning =
    appearanceTaskRunning ||
    isAnyTaskRunning

  // 注意：不再使用 editingItems，生成/编辑状态统一由任务态 + 实体态提供

  // 选择模式：显示名字+描述在上，三张图片在下
  if (showSelectionMode) {
    const selectionActions = (
      <>
        <button
          onClick={onRegenerate}
          disabled={isAppearanceTaskRunning || isAnyTaskRunning || uploadImage.isPending}
          className="w-6 h-6 rounded hover:bg-[var(--glass-tone-info-bg)] flex items-center justify-center transition-colors disabled:opacity-50"
          title={t('image.regenerateGroup')}
        >
          {isGroupTaskRunning ? (
            <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-[var(--glass-tone-info-fg)]" />
          ) : (
            <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
          )}
        </button>
        {onUndo && (appearance.previousImageUrl || appearance.previousImageUrls.length > 0) && (
          <button
            onClick={onUndo}
            disabled={isAppearanceTaskRunning || isAnyTaskRunning}
            className="w-6 h-6 rounded hover:bg-[var(--glass-tone-warning-bg)] flex items-center justify-center transition-colors disabled:opacity-50"
            title={t('image.undo')}
          >
            <AppIcon name="undo" className="w-4 h-4 text-[var(--glass-tone-warning-fg)]" />
          </button>
        )}
        {showDeleteButton && (
          <button
            onClick={onDelete}
            className="w-6 h-6 rounded hover:bg-[var(--glass-tone-danger-bg)] flex items-center justify-center transition-colors"
            title={t('character.delete')}
          >
            <AppIcon name="trash" className="w-4 h-4 text-[var(--glass-tone-danger-fg)]" />
          </button>
        )}
      </>
    )

    const selectionVoiceSettings = (
      <VoiceSettings
        characterId={character.id}
        characterName={character.name}
        customVoiceUrl={character.customVoiceUrl}
        projectId={projectId}
        onVoiceChange={onVoiceChange}
        onVoiceDesign={onVoiceDesign}
        onSelectFromHub={onVoiceSelectFromHub}
      />
    )

    return (
      <div className="col-span-3 bg-[var(--glass-bg-surface)] rounded-lg border-2 border-[var(--glass-stroke-base)] p-4 shadow-sm transition-all">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={() => handleUpload()}
          className="hidden"
        />

        <CharacterCardHeader
          mode="selection"
          characterName={character.name}
          changeReason={appearance.changeReason}
          isPrimaryAppearance={isPrimaryAppearance}
          selectedIndex={selectedIndex}
          actions={selectionActions}
        />

        <CharacterCardGallery
          mode="selection"
          characterId={character.id}
          appearanceId={appearance.id}
          characterName={character.name}
          imageUrlsWithIndex={imageUrlsWithIndex}
          selectedIndex={selectedIndex}
          isGroupTaskRunning={isGroupTaskRunning}
          isImageTaskRunning={isImageTaskRunning}
          displayTaskPresentation={displayTaskPresentation}
          onImageClick={onImageClick}
          onSelectImage={onSelectImage}
        />

        <CharacterCardActions
          mode="selection"
          selectedIndex={selectedIndex}
          isConfirmingSelection={isConfirmingSelection}
          confirmSelectionState={confirmSelectionState}
          onConfirmSelection={() => {
            setIsConfirmingSelection(true)
            onConfirmSelection?.(character.id, appearance.id)
          }}
          isPrimaryAppearance={isPrimaryAppearance}
          voiceSettings={selectionVoiceSettings}
        />
      </div>
    )
  }

  // 单图模式或已选择模式
  const overlayActions = (
    <>
      {!isAppearanceTaskRunning && !isAnyTaskRunning && (
        <button
          onClick={() => triggerUpload(selectedIndex !== null ? selectedIndex : 0)}
          disabled={uploadImage.isPending || isAppearanceTaskRunning || isAnyTaskRunning}
          className="w-7 h-7 rounded-full bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-tone-success-fg)] hover:text-white flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
          title={currentImageUrl ? t('image.uploadReplace') : t('image.upload')}
        >
          {uploadImage.isPending ? (
            <TaskStatusInline state={uploadPendingState} className="[&_span]:sr-only [&_svg]:text-current" />
          ) : (
            <AppIcon name="upload" className="w-4 h-4 text-[var(--glass-tone-success-fg)]" />
          )}
        </button>
      )}
      {!isAppearanceTaskRunning && !isAnyTaskRunning && currentImageUrl && onImageEdit && (
        <button
          onClick={() => onImageEdit(character.id, appearance.id, selectedIndex !== null ? selectedIndex : 0)}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          title={t('image.edit')}
        >
          <AppIcon name="edit" className="w-4 h-4 text-white" />
        </button>
      )}
      <button
        onClick={onRegenerate}
        disabled={uploadImage.isPending || isAppearanceTaskRunning}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90 ${(isAppearanceTaskRunning || isAnyTaskRunning)
          ? 'bg-[var(--glass-tone-success-fg)] hover:bg-[var(--glass-tone-success-fg)]'
          : 'bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-bg-surface)]'
          }`}
        title={(isAppearanceTaskRunning || isAnyTaskRunning) ? t('image.regenerateStuck') : t('location.regenerateImage')}
      >
        {isGroupTaskRunning ? (
          <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-white" />
        ) : (
          <AppIcon name="refresh" className={`w-4 h-4 ${(isAppearanceTaskRunning || isAnyTaskRunning) ? 'text-white' : 'text-[var(--glass-text-secondary)]'}`} />
        )}
      </button>
      {!isAppearanceTaskRunning && !isAnyTaskRunning && currentImageUrl && onUndo && (appearance.previousImageUrl || appearance.previousImageUrls.length > 0) && (
        <button
          onClick={onUndo}
          disabled={isAppearanceTaskRunning || isAnyTaskRunning}
          className="w-7 h-7 rounded-full bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-tone-warning-fg)] hover:text-white flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
          title={t('image.undo')}
        >
          <AppIcon name="undo" className="w-4 h-4 text-[var(--glass-tone-warning-fg)] hover:text-white" />
        </button>
      )}
    </>
  )

  const compactHeaderActions = (
    <>
      <button
        onClick={onEdit}
        className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-bg-muted)] flex items-center justify-center transition-colors"
        title={t('video.panelCard.editPrompt')}
      >
        <AppIcon name="edit" className="w-3.5 h-3.5 text-[var(--glass-text-secondary)]" />
      </button>
      {showDeleteButton && (
        <div className="relative">
          <button
            onClick={handleDeleteClick}
            className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-tone-danger-bg)] flex items-center justify-center transition-colors"
            title={appearanceCount <= 1 ? t('character.delete') : t('character.deleteOptions')}
          >
            <AppIcon name="trash" className="w-3.5 h-3.5 text-[var(--glass-tone-danger-fg)]" />
          </button>

          {showDeleteMenu && appearanceCount > 1 && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowDeleteMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] rounded-lg shadow-lg py-1 min-w-[100px]">
                <button
                  onClick={() => {
                    setShowDeleteMenu(false)
                    onDeleteAppearance?.()
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] whitespace-nowrap"
                >
                  {t('image.deleteThis')}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteMenu(false)
                    onDelete()
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] whitespace-nowrap"
                >
                  {t('character.deleteWhole')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )

  const compactVoiceSettings = (
    <VoiceSettings
      characterId={character.id}
      characterName={character.name}
      customVoiceUrl={character.customVoiceUrl}
      projectId={projectId}
      onVoiceChange={onVoiceChange}
      onVoiceDesign={onVoiceDesign}
      onSelectFromHub={onVoiceSelectFromHub}
      compact={true}
    />
  )

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={() => handleUpload()}
        className="hidden"
      />
      <div className="relative">
        <CharacterCardGallery
          mode="single"
          characterName={character.name}
          changeReason={appearance.changeReason}
          currentImageUrl={currentImageUrl}
          selectedIndex={selectedIndex}
          hasMultipleImages={hasMultipleImages}
          isAppearanceTaskRunning={isAppearanceTaskRunning || isGroupTaskRunning}
          displayTaskPresentation={displayTaskPresentation}
          appearanceErrorMessage={appearance.lastError?.message || appearance.imageErrorMessage}
          onImageClick={onImageClick}
          overlayActions={overlayActions}
        />
      </div>

      <CharacterCardHeader
        mode="compact"
        characterName={character.name}
        changeReason={appearance.changeReason}
        actions={compactHeaderActions}
      />

      <CharacterCardActions
        mode="compact"
        isPrimaryAppearance={isPrimaryAppearance}
        primaryAppearanceSelected={primaryAppearanceSelected}
        currentImageUrl={currentImageUrl}
        isAppearanceTaskRunning={isAppearanceTaskRunning}
        isAnyTaskRunning={isAnyTaskRunning}
        hasDescription={!!appearance.description}
        onGenerate={onGenerate}
        voiceSettings={compactVoiceSettings}
      />
    </div>
  )
}
