import { forwardRef, type InputHTMLAttributes } from 'react'

export interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  density?: 'compact' | 'default'
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(function GlassInput(
  { density = 'default', className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx(
        'glass-input-base',
        density === 'compact' ? 'h-9 px-3 text-sm leading-5' : 'h-10 px-3 text-sm leading-5',
        className
      )}
      {...props}
    />
  )
})

export default GlassInput
