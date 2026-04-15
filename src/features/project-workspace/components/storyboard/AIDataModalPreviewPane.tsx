'use client'

import { useState } from 'react'
import type { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'

interface AIDataModalPreviewPaneProps {
  t: ReturnType<typeof useTranslations<'storyboard'>>
  previewJson: Record<string, unknown>
}

export async function copyPreviewJsonText(text: string): Promise<void> {
  const clipboardApi = globalThis.navigator?.clipboard
  if (clipboardApi && typeof clipboardApi.writeText === 'function') {
    try {
      await clipboardApi.writeText(text)
      return
    } catch {
      // Fall through to manual copy fallback.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable')
  }

  const el = document.createElement('textarea')
  el.value = text
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
  document.body.removeChild(el)

  if (!copied) {
    throw new Error('Clipboard fallback failed')
  }
}

export default function AIDataModalPreviewPane({
  t,
  previewJson,
}: AIDataModalPreviewPaneProps) {
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')

  const handleCopy = async () => {
    const text = JSON.stringify(previewJson, null, 2)
    try {
      await copyPreviewJsonText(text)
      setCopyState('success')
    } catch {
      setCopyState('error')
    }

    window.setTimeout(() => setCopyState('idle'), 1600)
  }

  const copyLabel = t('common.copy')
  const copyIconName = copyState === 'success' ? 'clipboardCheck' : copyState === 'error' ? 'alert' : 'copy'

  return (
    <div className="w-[45%] flex flex-col overflow-hidden bg-[var(--glass-bg-muted)]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <AppIcon name="fileText" className="h-3.5 w-3.5 text-[var(--glass-tone-info-fg)]" />
          <span className="text-xs font-medium text-[var(--glass-text-tertiary)]">
            {t('aiData.jsonCheck')}
          </span>
        </div>
        <GlassButton
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          iconLeft={<AppIcon name={copyIconName} className="h-3 w-3" />}
        >
          {copyLabel}
        </GlassButton>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <pre className="text-[11px] font-mono leading-relaxed text-[var(--glass-text-secondary)] whitespace-pre-wrap break-all">
          {JSON.stringify(previewJson, null, 2)}
        </pre>
      </div>
    </div>
  )
}
