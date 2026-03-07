/**
 * Mutations 模块导出
 */

// ==================== Asset Hub (全局资产) ====================
export {
    // 角色相关
    useGenerateCharacterImage,
    useModifyCharacterImage,
    useSelectCharacterImage,
    useUndoCharacterImage,
    useUploadCharacterImage,
    useDeleteCharacter,
    useDeleteCharacterAppearance,
    useUploadCharacterVoice,
    // 场景相关
    useGenerateLocationImage,
    useModifyLocationImage,
    useSelectLocationImage,
    useUndoLocationImage,
    useUploadLocationImage,
    useDeleteLocation,
    // 音色相关
    useDeleteVoice,
    // 编辑相关
    useUpdateCharacterName,
    useUpdateLocationName,
    useUpdateCharacterAppearanceDescription,
    useUpdateLocationSummary,
    useAiModifyCharacterDescription,
    useAiModifyLocationDescription,
    useUploadAssetHubTempMedia,
    useAiDesignCharacter,
    useExtractAssetHubReferenceCharacterDescription,
    useCreateAssetHubCharacter,
} from './useAssetHubMutations'

// ==================== Project (项目资产) ====================
export * from './useCharacterMutations'
export * from './useLocationMutations'
export * from './useStoryboardMutations'
export * from './useVideoMutations'
export * from './useVoiceMutations'
export * from './useProjectConfigMutations'
export * from './useEpisodeMutations'
