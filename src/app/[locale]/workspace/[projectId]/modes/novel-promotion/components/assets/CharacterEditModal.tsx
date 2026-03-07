'use client'

import {
  CharacterEditModal as SharedCharacterEditModal,
  type CharacterEditModalProps as SharedCharacterEditModalProps,
} from '@/components/shared/assets/CharacterEditModal'

interface CharacterEditModalProps {
  characterId: string
  characterName: string
  appearanceId: number
  description: string
  introduction?: string | null
  descriptionIndex?: number
  projectId: string
  onClose: () => void
  onSave: (characterId: string, appearanceId: number) => void
  onUpdate: (newDescription: string) => void
  onIntroductionUpdate?: (newIntroduction: string) => void
  onNameUpdate?: (newName: string) => void
  isTaskRunning?: boolean
}

export default function CharacterEditModal({
  characterId,
  characterName,
  appearanceId,
  description,
  introduction,
  descriptionIndex,
  projectId,
  onClose,
  onSave,
  onUpdate,
  onIntroductionUpdate,
  onNameUpdate,
  isTaskRunning = false,
}: CharacterEditModalProps) {
  const handleSave: SharedCharacterEditModalProps['onSave'] = (
    nextCharacterId,
    nextAppearanceId,
  ) => {
    onSave(nextCharacterId, Number(nextAppearanceId))
  }

  return (
    <SharedCharacterEditModal
      mode="project"
      characterId={characterId}
      characterName={characterName}
      appearanceId={String(appearanceId)}
      description={description}
      introduction={introduction}
      descriptionIndex={descriptionIndex}
      projectId={projectId}
      onClose={onClose}
      onSave={handleSave}
      onUpdate={onUpdate}
      onIntroductionUpdate={onIntroductionUpdate}
      onNameUpdate={onNameUpdate}
      isTaskRunning={isTaskRunning}
    />
  )
}
