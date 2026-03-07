import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    ...props
  },
  ref
) {
  const variantClass =
    variant === 'primary' ? 'glass-btn-primary' :
      variant === 'ghost' ? 'glass-btn-ghost' :
        variant === 'danger' ? 'glass-btn-danger' :
          'glass-btn-secondary'

  const sizeClass =
    size === 'sm' ? 'h-8 px-3 text-xs' :
      size === 'lg' ? 'h-11 px-5 text-base' :
        'h-9 px-4 text-sm'
  const loadingState = loading
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'text',
      hasOutput: true,
    })
    : null

  return (
    <button
      ref={ref}
      className={cx('glass-btn-base', variantClass, sizeClass, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <TaskStatusInline state={loadingState} className="[&>span]:sr-only" />
      ) : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  )
})

export default GlassButton
