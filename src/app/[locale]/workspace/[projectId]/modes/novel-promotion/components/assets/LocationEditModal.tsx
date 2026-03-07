'use client'

import { LocationEditModal as SharedLocationEditModal } from '@/components/shared/assets/LocationEditModal'

interface LocationEditModalProps {
  locationId: string
  locationName: string
  description: string
  projectId: string
  onClose: () => void
  onSave: (locationId: string) => void
  onUpdate: (newDescription: string) => void
  onNameUpdate?: (newName: string) => void
  isTaskRunning?: boolean
}

export default function LocationEditModal({
  locationId,
  locationName,
  description,
  projectId,
  onClose,
  onSave,
  onUpdate,
  onNameUpdate,
  isTaskRunning = false,
}: LocationEditModalProps) {
  return (
    <SharedLocationEditModal
      mode="project"
      locationId={locationId}
      locationName={locationName}
      description={description}
      projectId={projectId}
      onClose={onClose}
      onSave={onSave}
      onUpdate={onUpdate}
      onNameUpdate={onNameUpdate}
      isTaskRunning={isTaskRunning}
    />
  )
}
