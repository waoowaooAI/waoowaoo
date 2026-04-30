'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'

export interface GlassSelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
  searchText?: string
}

export interface GlassSelectProps {
  value?: string
  options: GlassSelectOption[]
  onValueChange: (value: string) => void
  placeholder?: ReactNode
  disabled?: boolean
  ariaLabel?: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
  triggerClassName?: string
  triggerVariant?: 'field' | 'plain'
  panelClassName?: string
  optionClassName?: string
  menuMinWidth?: number
  menuMaxHeight?: number
  align?: 'start' | 'end'
  allowCustomValue?: boolean
  customValuePlaceholder?: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  renderValue?: (option: GlassSelectOption | undefined, value: string | undefined) => ReactNode
}

const VIEWPORT_GAP = 12

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

function matchesOption(option: GlassSelectOption, query: string): boolean {
  if (!query.trim()) return true
  const normalizedQuery = query.trim().toLowerCase()
  const text = [
    option.value,
    typeof option.label === 'string' ? option.label : '',
    option.searchText || '',
  ].join(' ').toLowerCase()
  return text.includes(normalizedQuery)
}

export default function GlassSelect({
  value,
  options,
  onValueChange,
  placeholder,
  disabled = false,
  ariaLabel,
  size = 'sm',
  className = '',
  triggerClassName = '',
  triggerVariant = 'field',
  panelClassName = '',
  optionClassName = '',
  menuMinWidth = 180,
  menuMaxHeight = 320,
  align = 'start',
  allowCustomValue = false,
  customValuePlaceholder,
  inputMode,
  renderValue,
}: GlassSelectProps) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  )
  const visibleOptions = useMemo(
    () => options.filter((option) => matchesOption(option, query)),
    [options, query],
  )

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const panelWidth = Math.max(menuMinWidth, rect.width)
    const availableBelow = viewportHeight - rect.bottom - VIEWPORT_GAP
    const availableAbove = rect.top - VIEWPORT_GAP
    const openUp = availableBelow < Math.min(menuMaxHeight, 180) && availableAbove > availableBelow
    const maxHeight = Math.max(96, Math.min(menuMaxHeight, openUp ? availableAbove : availableBelow))
    const preferredLeft = align === 'end' ? rect.right - panelWidth : rect.left
    const left = Math.max(VIEWPORT_GAP, Math.min(preferredLeft, viewportWidth - panelWidth - VIEWPORT_GAP))

    setPanelStyle({
      position: 'fixed',
      left,
      width: panelWidth,
      maxHeight,
      ...(openUp ? { bottom: viewportHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
  }, [align, menuMaxHeight, menuMinWidth])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
  }, [])

  const open = useCallback(() => {
    if (disabled) return
    updatePlacement()
    setIsOpen(true)
  }, [disabled, updatePlacement])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [close])

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [isOpen, updatePlacement])

  useEffect(() => {
    if (!isOpen || !allowCustomValue) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [allowCustomValue, isOpen])

  const commitValue = (nextValue: string) => {
    onValueChange(nextValue)
    close()
  }

  const commitCustomValue = () => {
    const nextValue = query.trim()
    if (!allowCustomValue || !nextValue) return
    commitValue(nextValue)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const enabledMatch = visibleOptions.find((option) => !option.disabled)
      if (enabledMatch && enabledMatch.value === query.trim()) {
        commitValue(enabledMatch.value)
        return
      }
      commitCustomValue()
    }
  }

  const heightClass = size === 'xs' ? 'h-8 text-[11px]' : size === 'md' ? 'h-10 text-sm' : 'h-9 text-xs'
  const radiusClass = size === 'xs' ? 'rounded-md' : 'rounded-lg'
  const valueNode = renderValue
    ? renderValue(selectedOption, value)
    : selectedOption?.label ?? (value || placeholder)

  return (
    <div className={cx('min-w-0', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => {
          if (isOpen) close()
          else open()
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cx(
          triggerVariant === 'field' && 'glass-input-base',
          'flex w-full min-w-0 items-center justify-between gap-2 px-2 transition-colors',
          heightClass,
          radiusClass,
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-[var(--glass-stroke-active)]',
          isOpen && '!border-[var(--glass-stroke-focus)]',
          triggerClassName,
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate text-left', selectedOption || value ? 'text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-tertiary)]')}>
          {valueNode}
        </span>
        <AppIcon
          name="chevronDown"
          className={cx('h-3.5 w-3.5 shrink-0 text-[var(--glass-text-tertiary)] transition-transform', isOpen && 'rotate-180 text-[var(--glass-text-primary)]')}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          aria-labelledby={id}
          className={cx(
            'glass-surface-modal z-[9999] overflow-hidden rounded-xl border border-[var(--glass-stroke-base)] shadow-[0_12px_32px_rgba(15,23,42,0.16)]',
            panelClassName,
          )}
          style={panelStyle}
        >
          {allowCustomValue && (
            <div className="border-b border-[var(--glass-stroke-base)] p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                inputMode={inputMode}
                placeholder={customValuePlaceholder}
                className="glass-input-base h-8 w-full rounded-md px-2 text-xs outline-none"
              />
            </div>
          )}
          <div className="max-h-[inherit] overflow-y-auto p-1 app-scrollbar">
            {visibleOptions.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return
                    commitValue(option.value)
                  }}
                  className={cx(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                    selected
                      ? 'bg-[var(--glass-bg-surface-strong)] font-semibold text-[var(--glass-text-primary)]'
                      : option.disabled
                        ? 'cursor-not-allowed text-[var(--glass-text-tertiary)] opacity-60'
                        : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)]',
                    optionClassName,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {selected && <AppIcon name="check" className="h-3.5 w-3.5 shrink-0 text-[var(--glass-tone-info-fg)]" />}
                </button>
              )
            })}
            {visibleOptions.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-[var(--glass-text-tertiary)]">
                {query}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
