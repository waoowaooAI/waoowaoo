'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { AppIcon } from '@/components/ui/icons'

export interface GlassNumberStepperProps {
  value?: number | string
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  allowedValues?: number[]
  disabled?: boolean
  ariaLabel?: string
  size?: 'xs' | 'sm' | 'md'
  fullWidth?: boolean
  className?: string
  controlClassName?: string
  inputClassName?: string
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

function toFiniteNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function uniqueSortedNumbers(values: number[] | undefined): number[] {
  if (!values) return []
  return Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b)
}

function isContiguousIntegerRange(values: number[]): boolean {
  if (values.length <= 1) return true
  return values.every((value, index) => index === 0 || value - values[index - 1] === 1)
}

function nearestAllowedValue(value: number, allowedValues: number[]): number {
  return allowedValues.reduce((nearest, candidate) => (
    Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest
  ), allowedValues[0])
}

export default function GlassNumberStepper({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  allowedValues,
  disabled = false,
  ariaLabel,
  size = 'sm',
  fullWidth = true,
  className = '',
  controlClassName = '',
  inputClassName = '',
}: GlassNumberStepperProps) {
  const normalizedAllowedValues = useMemo(() => uniqueSortedNumbers(allowedValues), [allowedValues])
  const allowedValuesAreRange = isContiguousIntegerRange(normalizedAllowedValues)
  const allowedMin = normalizedAllowedValues[0]
  const allowedMax = normalizedAllowedValues[normalizedAllowedValues.length - 1]
  const effectiveMin = min ?? allowedMin
  const effectiveMax = max ?? allowedMax
  const numericValue = toFiniteNumber(value) ?? effectiveMin ?? 0
  const [draftValue, setDraftValue] = useState(String(numericValue))

  useEffect(() => {
    setDraftValue(String(numericValue))
  }, [numericValue])

  const normalizeValue = (nextValue: number): number => {
    let normalized = Math.round(nextValue)
    if (normalizedAllowedValues.length > 0 && !allowedValuesAreRange) {
      return nearestAllowedValue(normalized, normalizedAllowedValues)
    }
    if (typeof effectiveMin === 'number') normalized = Math.max(effectiveMin, normalized)
    if (typeof effectiveMax === 'number') normalized = Math.min(effectiveMax, normalized)
    return normalized
  }

  const commitValue = (nextValue: number) => {
    const normalized = normalizeValue(nextValue)
    setDraftValue(String(normalized))
    if (normalized !== numericValue) onValueChange(normalized)
  }

  const findDiscreteStepValue = (direction: -1 | 1): number => {
    if (normalizedAllowedValues.length === 0 || allowedValuesAreRange) {
      return normalizeValue(numericValue + step * direction)
    }
    if (direction > 0) {
      return normalizedAllowedValues.find((candidate) => candidate > numericValue) ?? normalizedAllowedValues[normalizedAllowedValues.length - 1]
    }
    return [...normalizedAllowedValues].reverse().find((candidate) => candidate < numericValue) ?? normalizedAllowedValues[0]
  }

  const commitDraft = () => {
    const parsed = toFiniteNumber(draftValue)
    if (parsed === null) {
      setDraftValue(String(numericValue))
      return
    }
    commitValue(parsed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      commitValue(findDiscreteStepValue(1))
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      commitValue(findDiscreteStepValue(-1))
    }
  }

  const heightClass = size === 'xs' ? 'h-8 text-[11px]' : size === 'md' ? 'h-10 text-sm' : 'h-9 text-xs'
  const buttonClassName = cx(
    'flex h-full w-7 shrink-0 items-center justify-center text-[var(--glass-text-tertiary)] transition-colors',
    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)]',
    controlClassName,
  )

  return (
    <div
      className={cx(
        'glass-input-base flex min-w-0 items-center overflow-hidden rounded-md p-0',
        fullWidth ? 'w-full' : 'w-auto',
        heightClass,
        disabled && 'opacity-50',
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} -` : undefined}
        onClick={() => commitValue(findDiscreteStepValue(-1))}
        className={buttonClassName}
      >
        <AppIcon name="minus" className="h-3.5 w-3.5" />
      </button>
      <input
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        inputMode="numeric"
        className={cx(
          'min-w-0 flex-1 border-0 bg-transparent px-1 text-center font-medium text-[var(--glass-text-primary)] outline-none',
          disabled && 'cursor-not-allowed',
          inputClassName,
        )}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} +` : undefined}
        onClick={() => commitValue(findDiscreteStepValue(1))}
        className={buttonClassName}
      >
        <AppIcon name="plus" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
