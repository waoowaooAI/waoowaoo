import type { ReactNode } from 'react'

export interface GlassFieldProps {
  id?: string
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  actions?: ReactNode
  className?: string
  children: ReactNode
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

export default function GlassField({
  id,
  label,
  hint,
  error,
  required = false,
  actions,
  className,
  children
}: GlassFieldProps) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {(label || actions) && (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <label htmlFor={id} className="glass-field-label">
              {label}
              {required ? <span className="ml-1 text-[var(--glass-tone-danger-fg)]">*</span> : null}
            </label>
          ) : <span />}
          {actions}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs text-[var(--glass-tone-danger-fg)]">{error}</p>
      ) : hint ? (
        <p className="glass-field-hint">{hint}</p>
      ) : null}
    </div>
  )
}
