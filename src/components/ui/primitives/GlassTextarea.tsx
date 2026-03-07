import { forwardRef, type TextareaHTMLAttributes } from 'react'

export interface GlassTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  density?: 'compact' | 'default'
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(function GlassTextarea(
  { density = 'default', className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cx(
        'glass-textarea-base resize-none',
        density === 'compact' ? 'px-3 py-2 text-sm leading-6' : 'px-3 py-2.5 text-sm leading-6',
        className
      )}
      {...props}
    />
  )
})

export default GlassTextarea
