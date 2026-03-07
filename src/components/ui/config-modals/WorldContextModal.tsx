'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

interface WorldContextModalProps {
  isOpen: boolean
  onClose: () => void
  text: string
  onChange: (value: string) => void
}

export function WorldContextModal({ isOpen, onClose, text, onChange }: WorldContextModalProps) {
  const t = useTranslations('worldContextModal')
  const tc = useTranslations('common')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleTextChange = (value: string) => {
    onChange(value)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 500)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center glass-overlay animate-fadeIn"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="glass-surface-modal p-7 w-full max-w-3xl transform transition-all scale-100 h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-2xl font-bold text-[var(--glass-text-primary)]">{t('title')}</h2>
              <p className="text-[var(--glass-text-tertiary)] text-sm">{t('description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`glass-chip text-xs transition-all duration-300 ${
                saveStatus === 'saved' ? 'glass-chip-success' : 'glass-chip-neutral'
              }`}
            >
              {saveStatus === 'saved' ? (
                <>
                  <AppIcon name="check" className="w-3.5 h-3.5" />
                  {tc('saved')}
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 bg-[var(--glass-tone-success-fg)] rounded-full"></span>
                  {tc('autoSave')}
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="glass-btn-base glass-btn-soft rounded-full p-2 text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]"
            >
              <AppIcon name="close" className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 glass-surface-soft p-4 overflow-hidden flex flex-col">
          <textarea
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder={t('placeholder')}
            className="glass-textarea-base flex-1 text-base resize-none leading-relaxed placeholder:text-[var(--glass-text-tertiary)]/70 custom-scrollbar p-4"
          />
        </div>

        <div className="mt-6 pt-0 flex justify-start items-center flex-shrink-0">
          <span className="text-xs text-[var(--glass-text-tertiary)]">{t('hint')}</span>
        </div>
      </div>
    </div>
  )
}
