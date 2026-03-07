import type { ReactNode } from 'react'

export type UiDensity = 'compact' | 'default'

export interface GlassSurfaceProps {
  children: ReactNode
  className?: string
  variant?: 'panel' | 'card' | 'elevated' | 'modal'
  density?: UiDensity
  interactive?: boolean
  padded?: boolean
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

export default function GlassSurface({
  children,
  className,
  variant = 'panel',
  density = 'default',
  interactive = false,
  padded = true
}: GlassSurfaceProps) {
  const variantClass =
    variant === 'elevated' ? 'glass-surface-elevated' :
      variant === 'modal' ? 'glass-surface-modal' :
        'glass-surface'

  const densityClass = density === 'compact' ? 'glass-density-compact' : 'glass-density-default'

  return (
    <div
      className={cx(
        variantClass,
        densityClass,
        padded ? 'p-4 md:p-6' : '',
        interactive ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow-md)]' : '',
        className
      )}
    >
      {children}
    </div>
  )
}
