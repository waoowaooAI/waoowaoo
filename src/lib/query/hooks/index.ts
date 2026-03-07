/**
 * React Query Hooks 统一导出
 * 
 * 使用示例：
 * import { useProjectAssets, useGenerateProjectCharacterImage } from '@/lib/query/hooks'
 */

// 中心资产库
export {
    useGlobalCharacters,
    useGlobalLocations,
    useGlobalVoices,
    useGlobalFolders,
    useCreateFolder,
    useUpdateFolder,
    useDeleteFolder,
    useRefreshGlobalAssets,
    type GlobalCharacter,
    type GlobalCharacterAppearance,
    type GlobalLocation,
    type GlobalLocationImage,
    type GlobalVoice,
    type GlobalFolder,
} from './useGlobalAssets'
export {
    useGenerateCharacterImage,
    useModifyCharacterImage,
    useSelectCharacterImage,
    useUndoCharacterImage,
    useUploadCharacterImage,
    useDeleteCharacter,
    useDeleteCharacterAppearance,
    useUploadCharacterVoice,
    useGenerateLocationImage,
    useModifyLocationImage,
    useSelectLocationImage,
    useUndoLocationImage,
    useUploadLocationImage,
    useDeleteLocation,
    useDeleteVoice,
    useUpdateCharacterName,
    useUpdateLocationName,
    useUpdateCharacterAppearanceDescription,
    useUpdateLocationSummary,
    useAiModifyCharacterDescription,
    useAiModifyLocationDescription,
    useDesignAssetHubVoice,
    useSaveDesignedAssetHubVoice,
    useUploadAssetHubVoice,
    useAiDesignLocation,
    useCreateAssetHubLocation,
    useUploadAssetHubTempMedia,
    useAiDesignCharacter,
    useExtractAssetHubReferenceCharacterDescription,
    useCreateAssetHubCharacter,
} from '../mutations/useAssetHubMutations'

// 项目资产
export {
    useProjectAssets,
    useProjectCharacters,
    useProjectLocations,
    useRefreshProjectAssets,
    type ProjectAssetsData,
} from './useProjectAssets'
export {
    useGenerateProjectCharacterImage,
    useModifyProjectCharacterImage,
    useRegenerateCharacterGroup,
    useRegenerateSingleCharacterImage,
    useSelectProjectCharacterImage,
    useUndoProjectCharacterImage,
    useUploadProjectCharacterImage,
    useDeleteProjectCharacter,
    useDeleteProjectAppearance,
    useUpdateProjectCharacterName,
    useUploadProjectCharacterVoice,
    useGenerateProjectLocationImage,
    useModifyProjectLocationImage,
    useRegenerateLocationGroup,
    useRegenerateSingleLocationImage,
    useSelectProjectLocationImage,
    useUndoProjectLocationImage,
    useUploadProjectLocationImage,
    useDeleteProjectLocation,
    useUpdateProjectLocationName,
    useUpdateProjectAppearanceDescription,
    useUpdateProjectLocationDescription,
    useUpdateProjectCharacterIntroduction,
    useAiModifyProjectAppearanceDescription,
    useAiModifyProjectLocationDescription,
    useAiCreateProjectLocation,
    useCreateProjectLocation,
    useAiCreateProjectCharacter,
    useUploadProjectTempMedia,
    useExtractProjectReferenceCharacterDescription,
    useCreateProjectCharacter,
    useCreateProjectCharacterAppearance,
    useAnalyzeProjectGlobalAssets,
    useCopyProjectAssetFromGlobal,
    useAiModifyProjectShotPrompt,
    useUpdateProjectConfig,
    useUpdateProjectEpisodeField,
    useAnalyzeProjectAssets,
    useGetProjectStoryboardStats,
    useUpdateProjectPanelVideoPrompt,
    useRegenerateProjectPanelImage,
    useModifyProjectStoryboardImage,
    useDownloadProjectImages,
    useUpdateProjectPanel,
    useCreateProjectPanel,
    useDeleteProjectPanel,
    useDeleteProjectStoryboardGroup,
    useRegenerateProjectStoryboardText,
    useCreateProjectStoryboardGroup,
    useMoveProjectStoryboardGroup,
    useInsertProjectPanel,
    useConfirmProjectCharacterSelection,
    useConfirmProjectLocationSelection,
    useConfirmProjectCharacterProfile,
    useBatchConfirmProjectCharacterProfiles,
    useUpdateProjectCharacterVoiceSettings,
    useSaveProjectDesignedVoice,
    useUpdateProjectClip,
    useFetchProjectVoiceStageData,
    useAnalyzeProjectVoice,
    useGenerateProjectVoice,
    useCreateProjectVoiceLine,
    useUpdateProjectVoiceLine,
    useDeleteProjectVoiceLine,
    useDownloadProjectVoices,
    useBatchGenerateCharacterImages,
    useBatchGenerateLocationImages,
    useDesignProjectVoice,
    useAnalyzeProjectShotVariants,
    useUpdateProjectPhotographyPlan,
    useUpdateProjectPanelActingNotes,
    useListProjectEpisodeVideoUrls,
    useUpdateProjectPanelLink,
    useListProjectEpisodes,
    useSplitProjectEpisodes,
    useSplitProjectEpisodesByMarkers,
    useSaveProjectEpisodesBatch,
    useDownloadRemoteBlob,
    useCreateProjectPanelVariant,
    useClearProjectStoryboardError,
    useUpdateSpeakerVoice,
} from '../mutations/useProjectMutations'

export type {
    Character,
    CharacterAppearance,
    Location,
    LocationImage,
} from '@/types/project'

// 分镜
export {
    useStoryboards,
    useRegeneratePanelImage,
    useModifyPanelImage,
    useGenerateVideo,
    useBatchGenerateVideos,
    useSelectPanelCandidate,
    useRefreshStoryboards,
    type StoryboardPanel,
    type StoryboardGroup,
    type StoryboardData,
    type PanelCandidate,
} from './useStoryboards'

// 语音
export {
    useVoiceLines,
    useMatchedVoiceLines,
    useGenerateVoice,
    useBatchGenerateVoices,
    useUpdateVoiceText,
    useRefreshVoiceLines,
    type VoiceLine,
    type MatchedVoiceLine,
    type VoiceLinesData,
    type MatchedVoiceLinesData,
} from './useVoiceLines'

// 实时任务
export {
    useSSE,
} from './useSSE'
export {
    useStoryToScriptRunStream,
} from './useStoryToScriptRunStream'
export {
    useScriptToStoryboardRunStream,
} from './useScriptToStoryboardRunStream'

export {
    useAssetTaskPresentation,
    useStoryboardTaskPresentation,
    useVideoTaskPresentation,
    useVoiceTaskPresentation,
    type TaskPresentationTarget,
} from './useTaskPresentation'

// 项目数据
export {
    useProjectData,
    useRefreshProjectData,
    useEpisodeData,
    useEpisodes,
    useRefreshEpisodeData,
    useRefreshAll,
    type Episode,
} from './useProjectData'

export {
    useUserModels,
    type UserModelOption as QueryUserModelOption,
    type UserModelsPayload as QueryUserModelsPayload,
} from './useUserModels'
