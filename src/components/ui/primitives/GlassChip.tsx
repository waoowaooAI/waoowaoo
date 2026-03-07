import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'

export type UiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface GlassChipProps {
  tone?: UiTone
  icon?: ReactNode
  onRemove?: () => void
  children: ReactNode
  className?: string
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

export default function GlassChip({ tone = 'neutral', icon, onRemove, children, className }: GlassChipProps) {
  const toneClass =
    tone === 'info' ? 'glass-chip-info' :
      tone === 'success' ? 'glass-chip-success' :
        tone === 'warning' ? 'glass-chip-warning' :
          tone === 'danger' ? 'glass-chip-danger' :
            'glass-chip-neutral'

  return (
    <span className={cx('glass-chip', toneClass, className)}>
      {icon}
      <span>{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 transition-colors hover:bg-black/10"
          aria-label="remove"
        >
          <AppIcon name="close" className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  )
}
