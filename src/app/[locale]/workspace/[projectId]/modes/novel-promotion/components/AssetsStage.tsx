'use client'

import { useTranslations } from 'next-intl'
/**
 * 资产确认阶段 - 小说推文模式专用
 * 包含TTS生成和资产分析
 * 
 * 重构说明 v2:
 * - 角色和场景操作函数已提取到 hooks/useCharacterActions 和 hooks/useLocationActions
 * - 批量生成逻辑已提取到 hooks/useBatchGeneration
 * - TTS/音色逻辑已提取到 hooks/useTTSGeneration
 * - 弹窗状态已提取到 hooks/useAssetModals
 * - 档案管理已提取到 hooks/useProfileManagement
 * - UI已拆分为 CharacterSection, LocationSection, AssetToolbar, AssetModals 组件
 */

import { useState, useCallback, useMemo } from 'react'
// 移除了 useRouter 导入，因为不再需要在组件中操作 URL
import { Character, CharacterAppearance } from '@/types/project'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
  useGenerateProjectCharacterImage,
  useGenerateProjectLocationImage,
  useProjectAssets,
  useRefreshProjectAssets,
} from '@/lib/query/hooks'

// Hooks
import { useCharacterActions } from './assets/hooks/useCharacterActions'
import { useLocationActions } from './assets/hooks/useLocationActions'
import { useBatchGeneration } from './assets/hooks/useBatchGeneration'
import { useTTSGeneration } from './assets/hooks/useTTSGeneration'
import { useAssetModals } from './assets/hooks/useAssetModals'
import { useProfileManagement } from './assets/hooks/useProfileManagement'
import { useAssetsCopyFromHub } from './assets/hooks/useAssetsCopyFromHub'
import { useAssetsGlobalActions } from './assets/hooks/useAssetsGlobalActions'
import { useAssetsImageEdit } from './assets/hooks/useAssetsImageEdit'

// Components
import CharacterSection from './assets/CharacterSection'
import LocationSection from './assets/LocationSection'
import AssetToolbar from './assets/AssetToolbar'
import AssetsStageStatusOverlays from './assets/AssetsStageStatusOverlays'
import UnconfirmedProfilesSection from './assets/UnconfirmedProfilesSection'
import AssetsStageModals from './assets/AssetsStageModals'

interface AssetsStageProps {
  projectId: string
  isAnalyzingAssets: boolean
  focusCharacterId?: string | null
  focusCharacterRequestId?: number
  // 🔥 通过 props 触发全局分析（避免 URL 参数竞态条件）
  triggerGlobalAnalyze?: boolean
  onGlobalAnalyzeComplete?: () => void
}

export default function AssetsStage({
  projectId,
  isAnalyzingAssets,
  focusCharacterId = null,
  focusCharacterRequestId = 0,
  triggerGlobalAnalyze = false,
  onGlobalAnalyzeComplete
}: AssetsStageProps) {
  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  // 🔧 使用 useMemo 稳定引用，防止 useCallback/useEffect 依赖问题
  const characters = useMemo(() => assets?.characters ?? [], [assets?.characters])
  const locations = useMemo(() => assets?.locations ?? [], [assets?.locations])
  // 🔥 使用 React Query 刷新，替代 onRefresh prop
  const refreshAssets = useRefreshProjectAssets(projectId)
  const onRefresh = useCallback(() => { refreshAssets() }, [refreshAssets])

  // 🔥 V6.6 重构：使用 mutation hooks 替代 onGenerateImage prop
  const generateCharacterImage = useGenerateProjectCharacterImage(projectId)
  const generateLocationImage = useGenerateProjectLocationImage(projectId)

  // 🔥 内部图片生成函数 - 使用 mutation hooks 实现乐观更新
  const handleGenerateImage = useCallback(async (type: 'character' | 'location', id: string, appearanceId?: string) => {
    if (type === 'character' && appearanceId) {
      await generateCharacterImage.mutateAsync({ characterId: id, appearanceId })
    } else if (type === 'location') {
      // 场景生成默认使用 imageIndex: 0
      await generateLocationImage.mutateAsync({ locationId: id, imageIndex: 0 })
    }
  }, [generateCharacterImage, generateLocationImage])

  const t = useTranslations('assets')
  // 计算资产总数
  const totalAppearances = characters.reduce((sum, char) => sum + (char.appearances?.length || 0), 0)
  const totalLocations = locations.length
  const totalAssets = totalAppearances + totalLocations

  // 本地 UI 状态
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)

  // 辅助：获取角色形象
  const getAppearances = (character: Character): CharacterAppearance[] => {
    return character.appearances || []
  }

  // 显示提示
  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' = 'success', duration = 3000) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), duration)
  }, [])

  // === 使用提取的 Hooks ===

  // 🔥 V6.5 重构：hooks 现在内部订阅 useProjectAssets，不再需要传 characters/locations

  // 批量生成
  const {
    isBatchSubmitting,
    batchProgress,
    activeTaskKeys,
    clearTransientTaskKey,
    handleGenerateAllImages,
    handleRegenerateAllImages
  } = useBatchGeneration({
    projectId,
    handleGenerateImage
  })

  const {
    isGlobalAnalyzing,
    globalAnalyzingState,
    handleGlobalAnalyze,
  } = useAssetsGlobalActions({
    projectId,
    triggerGlobalAnalyze,
    onGlobalAnalyzeComplete,
    onRefresh,
    showToast,
    t,
  })

  const {
    copyFromGlobalTarget,
    isGlobalCopyInFlight,
    handleCopyFromGlobal,
    handleCopyLocationFromGlobal,
    handleVoiceSelectFromHub,
    handleConfirmCopyFromGlobal,
    handleCloseCopyPicker,
  } = useAssetsCopyFromHub({
    projectId,
    onRefresh,
    showToast,
  })

  // 角色操作
  const {
    handleDeleteCharacter,
    handleDeleteAppearance,
    handleSelectCharacterImage,
    handleConfirmSelection,
    handleRegenerateSingleCharacter,
    handleRegenerateCharacterGroup
  } = useCharacterActions({
    projectId,
    showToast
  })

  // 场景操作
  const {
    handleDeleteLocation,
    handleSelectLocationImage,
    handleConfirmLocationSelection,
    handleRegenerateSingleLocation,
    handleRegenerateLocationGroup
  } = useLocationActions({
    projectId,
    showToast
  })

  // TTS/音色
  const {
    voiceDesignCharacter,
    handleVoiceChange,
    handleOpenVoiceDesign,
    handleVoiceDesignSave,
    handleCloseVoiceDesign
  } = useTTSGeneration({
    projectId
  })

  // 弹窗状态
  const {
    editingAppearance,
    editingLocation,
    showAddCharacter,
    showAddLocation,
    imageEditModal,
    characterImageEditModal,
    setShowAddCharacter,
    setShowAddLocation,
    handleEditAppearance,
    handleEditLocation,
    handleOpenLocationImageEdit,
    handleOpenCharacterImageEdit,
    closeEditingAppearance,
    closeEditingLocation,
    closeAddCharacter,
    closeAddLocation,
    closeImageEditModal,
    closeCharacterImageEditModal
  } = useAssetModals({
    projectId
  })
  // 档案管理
  const {
    unconfirmedCharacters,
    isConfirmingCharacter,
    deletingCharacterId,
    batchConfirming,
    editingProfile,
    handleEditProfile,
    handleConfirmProfile,
    handleBatchConfirm,
    handleDeleteProfile,
    setEditingProfile
  } = useProfileManagement({
    projectId,
    showToast
  })
  const batchConfirmingState = batchConfirming
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'modify',
      resource: 'image',
      hasOutput: false,
    })
    : null

  const {
    handleUndoCharacter,
    handleUndoLocation,
    handleLocationImageEdit,
    handleCharacterImageEdit,
    handleUpdateAppearanceDescription,
    handleUpdateLocationDescription,
  } = useAssetsImageEdit({
    projectId,
    t,
    showToast,
    onRefresh,
    editingAppearance,
    editingLocation,
    imageEditModal,
    characterImageEditModal,
    closeEditingAppearance,
    closeEditingLocation,
    closeImageEditModal,
    closeCharacterImageEditModal,
  })

  return (
    <div className="space-y-4">
      <AssetsStageStatusOverlays
        toast={toast}
        onCloseToast={() => setToast(null)}
        isGlobalAnalyzing={isGlobalAnalyzing}
        globalAnalyzingState={globalAnalyzingState}
        globalAnalyzingTitle={t('toolbar.globalAnalyzing')}
        globalAnalyzingHint={t('toolbar.globalAnalyzingHint')}
        globalAnalyzingTip={t('toolbar.globalAnalyzingTip')}
      />

      {/* 资产工具栏 */}
      <AssetToolbar
        projectId={projectId}
        totalAssets={totalAssets}
        totalAppearances={totalAppearances}
        totalLocations={totalLocations}
        isBatchSubmitting={isBatchSubmitting}
        isAnalyzingAssets={isAnalyzingAssets}
        isGlobalAnalyzing={isGlobalAnalyzing}
        batchProgress={batchProgress}
        onGenerateAll={handleGenerateAllImages}
        onRegenerateAll={handleRegenerateAllImages}
        onGlobalAnalyze={handleGlobalAnalyze}
      />

      <UnconfirmedProfilesSection
        unconfirmedCharacters={unconfirmedCharacters}
        confirmTitle={t('stage.confirmProfiles')}
        confirmHint={t('stage.confirmHint')}
        confirmAllLabel={t('stage.confirmAll', { count: unconfirmedCharacters.length })}
        batchConfirming={batchConfirming}
        batchConfirmingState={batchConfirmingState}
        deletingCharacterId={deletingCharacterId}
        isConfirmingCharacter={isConfirmingCharacter}
        onBatchConfirm={handleBatchConfirm}
        onEditProfile={handleEditProfile}
        onConfirmProfile={handleConfirmProfile}
        onUseExistingProfile={handleCopyFromGlobal}
        onDeleteProfile={handleDeleteProfile}
      />

      {/* 角色资产区块 */}
      <CharacterSection
        projectId={projectId}
        focusCharacterId={focusCharacterId}
        focusCharacterRequestId={focusCharacterRequestId}
        activeTaskKeys={activeTaskKeys}
        onClearTaskKey={clearTransientTaskKey}
        isAnalyzingAssets={isAnalyzingAssets}
        onAddCharacter={() => setShowAddCharacter(true)}
        onDeleteCharacter={handleDeleteCharacter}
        onDeleteAppearance={handleDeleteAppearance}
        onEditAppearance={handleEditAppearance}
        handleGenerateImage={handleGenerateImage}
        onSelectImage={handleSelectCharacterImage}
        onConfirmSelection={handleConfirmSelection}
        onRegenerateSingle={handleRegenerateSingleCharacter}
        onRegenerateGroup={handleRegenerateCharacterGroup}
        onUndo={handleUndoCharacter}
        onImageClick={setPreviewImage}
        onImageEdit={(charId, appIdx, imgIdx, name) => handleOpenCharacterImageEdit(charId, appIdx, imgIdx, name)}
        onVoiceChange={(characterId, customVoiceUrl) => handleVoiceChange(characterId, 'custom', characterId, customVoiceUrl)}
        onVoiceDesign={handleOpenVoiceDesign}
        onVoiceSelectFromHub={handleVoiceSelectFromHub}
        onCopyFromGlobal={handleCopyFromGlobal}
        getAppearances={getAppearances}
      />

      {/* 场景资产区块 */}
      <LocationSection
        projectId={projectId}
        activeTaskKeys={activeTaskKeys}
        onClearTaskKey={clearTransientTaskKey}
        onAddLocation={() => setShowAddLocation(true)}
        onDeleteLocation={handleDeleteLocation}
        onEditLocation={handleEditLocation}
        handleGenerateImage={handleGenerateImage}
        onSelectImage={handleSelectLocationImage}
        onConfirmSelection={handleConfirmLocationSelection}
        onRegenerateSingle={handleRegenerateSingleLocation}
        onRegenerateGroup={handleRegenerateLocationGroup}
        onUndo={handleUndoLocation}
        onImageClick={setPreviewImage}
        onImageEdit={(locId, imgIdx) => handleOpenLocationImageEdit(locId, imgIdx)}
        onCopyFromGlobal={handleCopyLocationFromGlobal}
      />

      <AssetsStageModals
        projectId={projectId}
        onRefresh={onRefresh}
        onClosePreview={() => setPreviewImage(null)}
        handleGenerateImage={handleGenerateImage}
        handleUpdateAppearanceDescription={handleUpdateAppearanceDescription}
        handleUpdateLocationDescription={handleUpdateLocationDescription}
        handleLocationImageEdit={handleLocationImageEdit}
        handleCharacterImageEdit={handleCharacterImageEdit}
        handleCloseVoiceDesign={handleCloseVoiceDesign}
        handleVoiceDesignSave={handleVoiceDesignSave}
        handleCloseCopyPicker={handleCloseCopyPicker}
        handleConfirmCopyFromGlobal={handleConfirmCopyFromGlobal}
        handleConfirmProfile={handleConfirmProfile}
        closeEditingAppearance={closeEditingAppearance}
        closeEditingLocation={closeEditingLocation}
        closeAddCharacter={closeAddCharacter}
        closeAddLocation={closeAddLocation}
        closeImageEditModal={closeImageEditModal}
        closeCharacterImageEditModal={closeCharacterImageEditModal}
        isConfirmingCharacter={isConfirmingCharacter}
        setEditingProfile={setEditingProfile}
        previewImage={previewImage}
        imageEditModal={imageEditModal}
        characterImageEditModal={characterImageEditModal}
        editingAppearance={editingAppearance}
        editingLocation={editingLocation}
        showAddCharacter={showAddCharacter}
        showAddLocation={showAddLocation}
        voiceDesignCharacter={voiceDesignCharacter}
        editingProfile={editingProfile}
        copyFromGlobalTarget={copyFromGlobalTarget}
        isGlobalCopyInFlight={isGlobalCopyInFlight}
      />
    </div>
  )
}
