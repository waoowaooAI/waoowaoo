'use client'

import type { ComponentProps } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'

interface ApiConfigToolbarProps {
  title: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  savingState: ComponentProps<typeof TaskStatusInline>['state'] | null
  savingLabel: string
  savedLabel: string
  saveFailedLabel: string
}

export function ApiConfigToolbar({
  title,
  saveStatus,
  savingState,
  savingLabel,
  savedLabel,
  saveFailedLabel,
}: ApiConfigToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-6 py-4">
      <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{title}</h2>
      <div className="flex items-center gap-2 text-sm">
        {saveStatus === 'saving' && (
          <span className="glass-chip glass-chip-info flex items-center gap-1">
            <TaskStatusInline state={savingState} className="[&>span]:sr-only" />
            <span>{savingLabel}</span>
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="glass-chip glass-chip-success flex items-center gap-1">
            <AppIcon name="check" className="w-4 h-4" />
            {savedLabel}
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="glass-chip glass-chip-danger flex items-center gap-1">
            <AppIcon name="close" className="w-4 h-4" />
            {saveFailedLabel}
          </span>
        )}
      </div>
    </div>
  )
}
