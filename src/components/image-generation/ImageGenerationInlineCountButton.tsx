'use client'

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { GlassNumberStepper } from '@/components/ui/primitives'

interface ImageGenerationInlineCountButtonProps {
  prefix: ReactNode
  suffix?: ReactNode
  value: number
  options: number[]
  onValueChange: (value: number) => void
  onClick: () => void
  disabled?: boolean
  actionDisabled?: boolean
  selectDisabled?: boolean
  showCountControl?: boolean
  splitInteractiveZones?: boolean
  className?: string
  actionClassName?: string
  countClassName?: string
  selectClassName?: string
  labelClassName?: string
  ariaLabel: string
}

const COUNT_STEPPER_WIDTH_CLASS = 'w-[64px]'

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
  showCountControl = true,
  splitInteractiveZones = false,
  className = '',
  actionClassName = '',
  countClassName = '',
  labelClassName = '',
  ariaLabel,
}: ImageGenerationInlineCountButtonProps) {
  const isActionDisabled = disabled || actionDisabled === true
  const isSelectDisabled = disabled || selectDisabled === true
  const rootStateClassName = isActionDisabled
    ? 'opacity-60 cursor-not-allowed'
    : 'cursor-pointer'
  const selectStateClassName = isSelectDisabled
    ? 'opacity-70'
    : 'cursor-pointer'
  const resolvedActionClassName = (actionClassName || className).trim()
  const countStepper = (
    <GlassNumberStepper
      value={value}
      onValueChange={onValueChange}
      allowedValues={options}
      ariaLabel={ariaLabel}
      disabled={isSelectDisabled}
      size="xs"
      fullWidth={false}
      className={`${selectStateClassName} h-6 ${COUNT_STEPPER_WIDTH_CLASS} rounded-full border-white/20 bg-white/10 text-current`.trim()}
      controlClassName="!w-4 text-current opacity-80 hover:bg-white/12 hover:text-current"
      inputClassName="w-6 px-0 text-xs font-semibold text-current"
    />
  )

  if (!showCountControl) {
    return (
      <button
        type="button"
        onClick={() => {
          if (isActionDisabled) return
          onClick()
        }}
        disabled={isActionDisabled}
        aria-label={ariaLabel}
        className={`${resolvedActionClassName} ${rootStateClassName}`.trim()}
      >
        <span className={`${labelClassName} inline-flex items-center gap-1 whitespace-nowrap`.trim()}>{prefix}</span>
      </button>
    )
  }

  if (splitInteractiveZones) {
    return (
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (isActionDisabled) return
            onClick()
          }}
          disabled={isActionDisabled}
          aria-label={ariaLabel}
          className={`${resolvedActionClassName} ${rootStateClassName}`.trim()}
        >
          <span className={`${labelClassName} inline-flex items-center gap-1 whitespace-nowrap`.trim()}>{prefix}</span>
        </button>
        <span
          className={`inline-flex items-center gap-1 ${countClassName}`.trim()}
        >
          {countStepper}
          {suffix ? (
            <span className={`${labelClassName} whitespace-nowrap`.trim()}>{suffix}</span>
          ) : null}
        </span>
      </div>
    )
  }

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
      <span className={`${labelClassName} inline-flex shrink-0 items-center whitespace-nowrap leading-none`.trim()}>{prefix}</span>
      <span
        className={`inline-flex shrink-0 items-center ${countClassName}`.trim()}
        onClick={(event: MouseEvent<HTMLSpanElement>) => event.stopPropagation()}
      >
        {countStepper}
      </span>
      <span className={`${labelClassName} inline-flex shrink-0 items-center whitespace-nowrap leading-none`.trim()}>{suffix}</span>
    </div>
  )
}
