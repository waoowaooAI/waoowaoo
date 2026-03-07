'use client'

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'

interface ImageGenerationInlineCountButtonProps {
  prefix: ReactNode
  suffix: ReactNode
  value: number
  options: number[]
  onValueChange: (value: number) => void
  onClick: () => void
  disabled?: boolean
  actionDisabled?: boolean
  selectDisabled?: boolean
  className?: string
  selectClassName?: string
  labelClassName?: string
  ariaLabel: string
}

export default function ImageGenerationInlineCountButton({
  prefix,
  suffix,
  value,
  options,
  onValueChange,
  onClick,
  disabled = false,
  actionDisabled,
  selectDisabled,
  className = '',
  selectClassName = '',
  labelClassName = '',
  ariaLabel,
}: ImageGenerationInlineCountButtonProps) {
  const isActionDisabled = disabled || actionDisabled === true
  const isSelectDisabled = disabled || selectDisabled === true
  const rootStateClassName = isActionDisabled
    ? 'opacity-60 cursor-not-allowed'
    : 'cursor-pointer'
  const selectStateClassName = isSelectDisabled
    ? 'pointer-events-none opacity-70'
    : 'cursor-pointer'

  return (
    <div
      role="button"
      tabIndex={isActionDisabled ? -1 : 0}
      onClick={() => {
        if (isActionDisabled) return
        onClick()
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (isActionDisabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      aria-disabled={isActionDisabled}
      className={`${className} ${rootStateClassName}`.trim()}
    >
      <span className={labelClassName}>{prefix}</span>
      <span
        className={`group relative inline-flex items-center rounded-md px-1.5 py-0.5 transition-colors ${
          isSelectDisabled ? '' : 'hover:bg-white/12 focus-within:bg-white/14'
        }`}
        onClick={(event: MouseEvent<HTMLSpanElement>) => event.stopPropagation()}
      >
        <select
          value={String(value)}
          onChange={(event) => onValueChange(Number(event.target.value))}
          aria-label={ariaLabel}
          disabled={isSelectDisabled}
          className={`${selectClassName} ${selectStateClassName}`.trim()}
        >
          {options.map((option) => (
            <option key={option} value={option} className="text-black">
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-current opacity-85 transition-colors group-hover:opacity-100 group-focus-within:opacity-100">
          <AppIcon name="chevronDown" className="h-3 w-3" />
        </span>
      </span>
      <span className={labelClassName}>{suffix}</span>
    </div>
  )
}
