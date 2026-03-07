'use client'

import { useTranslations } from 'next-intl'
import { ConfigConfirmModal } from './ConfigConfirmModal'

interface ConfigDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onDelete: () => void
  title: string
  description?: string
  deleteText?: string
  cancelText?: string
  deleteDisabled?: boolean
}

export function ConfigDeleteModal({
  isOpen,
  onClose,
  onDelete,
  title,
  description,
  deleteText,
  cancelText,
  deleteDisabled = false,
}: ConfigDeleteModalProps) {
  const t = useTranslations('configModal')
  return (
    <ConfigConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onDelete}
      title={title}
      description={description}
      confirmText={deleteText || t('delete')}
      cancelText={cancelText || t('cancel')}
      danger
      confirmDisabled={deleteDisabled}
    />
  )
}
