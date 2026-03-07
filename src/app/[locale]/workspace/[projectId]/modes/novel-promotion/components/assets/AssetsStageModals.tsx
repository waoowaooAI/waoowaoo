'use client'

import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import ImageEditModal from './ImageEditModal'
import VoiceDesignDialog from '../voice/VoiceDesignDialog'
import CharacterProfileDialog from './CharacterProfileDialog'
import {
  CharacterCreationModal,
  CharacterEditModal,
  LocationCreationModal,
  LocationEditModal,
} from '@/components/shared/assets'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import type { CharacterProfileData } from '@/types/character-profile'
import type { GlobalCopyTarget } from './hooks/useAssetsCopyFromHub'

interface EditingAppearanceState {
  characterId: string
  characterName: string
  appearanceId: string
  description: string
  descriptionIndex?: number
  introduction?: string | null
}

interface EditingLocationState {
  locationId: string
  locationName: string
  description: string
}

interface LocationImageEditModalState {
  locationName: string
}

interface CharacterImageEditModalState {
  characterName: string
}

interface VoiceDesignCharacterState {
  name: string
  hasExistingVoice: boolean
}

interface EditingProfileState {
  characterId: string
  characterName: string
  profileData: CharacterProfileData
}

interface AssetsStageModalsProps {
  projectId: string
  onRefresh: () => void
  onClosePreview: () => void
  handleGenerateImage: (type: 'character' | 'location', id: string, appearanceId?: string) => Promise<void>
  handleUpdateAppearanceDescription: (newDescription: string) => Promise<void>
  handleUpdateLocationDescription: (newDescription: string) => Promise<void>
  handleLocationImageEdit: (modifyPrompt: string, extraImageUrls?: string[]) => Promise<void>
  handleCharacterImageEdit: (modifyPrompt: string, extraImageUrls?: string[]) => Promise<void>
  handleCloseVoiceDesign: () => void
  handleVoiceDesignSave: (voiceId: string, audioBase64: string) => Promise<void>
  handleCloseCopyPicker: () => void
  handleConfirmCopyFromGlobal: (globalAssetId: string) => Promise<void>
  handleConfirmProfile: (characterId: string, updatedProfileData?: CharacterProfileData) => Promise<void>
  closeEditingAppearance: () => void
  closeEditingLocation: () => void
  closeAddCharacter: () => void
  closeAddLocation: () => void
  closeImageEditModal: () => void
  closeCharacterImageEditModal: () => void
  isConfirmingCharacter: (characterId: string) => boolean
  setEditingProfile: (value: EditingProfileState | null) => void
  previewImage: string | null
  imageEditModal: LocationImageEditModalState | null
  characterImageEditModal: CharacterImageEditModalState | null
  editingAppearance: EditingAppearanceState | null
  editingLocation: EditingLocationState | null
  showAddCharacter: boolean
  showAddLocation: boolean
  voiceDesignCharacter: VoiceDesignCharacterState | null
  editingProfile: EditingProfileState | null
  copyFromGlobalTarget: GlobalCopyTarget | null
  isGlobalCopyInFlight: boolean
}

export default function AssetsStageModals({
  projectId,
  onRefresh,
  onClosePreview,
  handleGenerateImage,
  handleUpdateAppearanceDescription,
  handleUpdateLocationDescription,
  handleLocationImageEdit,
  handleCharacterImageEdit,
  handleCloseVoiceDesign,
  handleVoiceDesignSave,
  handleCloseCopyPicker,
  handleConfirmCopyFromGlobal,
  handleConfirmProfile,
  closeEditingAppearance,
  closeEditingLocation,
  closeAddCharacter,
  closeAddLocation,
  closeImageEditModal,
  closeCharacterImageEditModal,
  isConfirmingCharacter,
  setEditingProfile,
  previewImage,
  imageEditModal,
  characterImageEditModal,
  editingAppearance,
  editingLocation,
  showAddCharacter,
  showAddLocation,
  voiceDesignCharacter,
  editingProfile,
  copyFromGlobalTarget,
  isGlobalCopyInFlight,
}: AssetsStageModalsProps) {
  return (
    <>
      {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={onClosePreview} />}

      {imageEditModal && (
        <ImageEditModal
          type="location"
          name={imageEditModal.locationName}
          onClose={closeImageEditModal}
          onConfirm={handleLocationImageEdit}
        />
      )}

      {characterImageEditModal && (
        <ImageEditModal
          type="character"
          name={characterImageEditModal.characterName}
          onClose={closeCharacterImageEditModal}
          onConfirm={handleCharacterImageEdit}
        />
      )}

      {editingAppearance && (
        <CharacterEditModal
          mode="project"
          characterId={editingAppearance.characterId}
          characterName={editingAppearance.characterName}
          appearanceId={editingAppearance.appearanceId}
          description={editingAppearance.description}
          descriptionIndex={editingAppearance.descriptionIndex}
          introduction={editingAppearance.introduction}
          projectId={projectId}
          onClose={closeEditingAppearance}
          onSave={(characterId, appearanceId) => void handleGenerateImage('character', characterId, appearanceId)}
          onUpdate={handleUpdateAppearanceDescription}
        />
      )}

      {editingLocation && (
        <LocationEditModal
          mode="project"
          locationId={editingLocation.locationId}
          locationName={editingLocation.locationName}
          description={editingLocation.description}
          projectId={projectId}
          onClose={closeEditingLocation}
          onSave={(locationId) => void handleGenerateImage('location', locationId)}
          onUpdate={handleUpdateLocationDescription}
        />
      )}

      {showAddCharacter && (
        <CharacterCreationModal
          mode="project"
          projectId={projectId}
          onClose={closeAddCharacter}
          onSuccess={() => {
            closeAddCharacter()
            onRefresh()
          }}
        />
      )}

      {showAddLocation && (
        <LocationCreationModal
          mode="project"
          projectId={projectId}
          onClose={closeAddLocation}
          onSuccess={() => {
            closeAddLocation()
            onRefresh()
          }}
        />
      )}

      {voiceDesignCharacter && (
        <VoiceDesignDialog
          isOpen={!!voiceDesignCharacter}
          speaker={voiceDesignCharacter.name}
          hasExistingVoice={voiceDesignCharacter.hasExistingVoice}
          projectId={projectId}
          onClose={handleCloseVoiceDesign}
          onSave={handleVoiceDesignSave}
        />
      )}

      {editingProfile && (
        <CharacterProfileDialog
          isOpen={!!editingProfile}
          characterName={editingProfile.characterName}
          profileData={editingProfile.profileData}
          onClose={() => setEditingProfile(null)}
          onSave={(profileData) => handleConfirmProfile(editingProfile.characterId, profileData)}
          isSaving={isConfirmingCharacter(editingProfile.characterId)}
        />
      )}

      {copyFromGlobalTarget && (
        <GlobalAssetPicker
          isOpen={!!copyFromGlobalTarget}
          onClose={handleCloseCopyPicker}
          onSelect={handleConfirmCopyFromGlobal}
          type={copyFromGlobalTarget.type}
          loading={isGlobalCopyInFlight}
        />
      )}
    </>
  )
}
