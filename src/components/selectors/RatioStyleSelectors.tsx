'use client'

/**
 * RatioSelector / StyleSelector - 公共选择器组件
 * 卡片边框风格：选中时蓝色描边 + 淡色背景 + 加粗文字
 *
 * 使用场景：首页、项目故事输入页
 */
import { createPortal } from 'react-dom'
import { useState, useRef, useEffect, useLayoutEffect, useCallback, type CSSProperties } from 'react'
import { AppIcon } from '@/components/ui/icons'

const TRIGGER_CLASSNAME = 'glass-input-base flex h-10 w-full items-center justify-between gap-2 px-2.5 transition-colors'
const TRIGGER_TEXT_CLASSNAME = 'text-[13px] font-medium text-[var(--glass-text-primary)]'

const VIEWPORT_EDGE_GAP = 8
const DEFAULT_MAX_HEIGHT = 280

function useFloatingDropdown(isOpen: boolean, minWidth: number) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP
    const spaceAbove = rect.top - VIEWPORT_EDGE_GAP
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow
    const availableSpace = openUpward ? spaceAbove : spaceBelow
    const width = Math.min(
      Math.max(rect.width, minWidth),
      viewportWidth - VIEWPORT_EDGE_GAP * 2,
    )
    const left = Math.min(
      Math.max(VIEWPORT_EDGE_GAP, rect.left),
      viewportWidth - width - VIEWPORT_EDGE_GAP,
    )

    setPanelStyle({
      position: 'fixed',
      left,
      width,
      maxHeight: Math.max(120, Math.min(DEFAULT_MAX_HEIGHT, availableSpace)),
      ...(openUpward
        ? { bottom: viewportHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    })
  }, [minWidth])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (!isOpen) return
      setPanelStyle({})
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  return { triggerRef, panelRef, panelStyle }
}

/** 线框比例预览块 */
function RatioShape({ ratio, selected, size = 26 }: { ratio: string; selected: boolean; size?: number }) {
  const [w, h] = ratio.split(':').map(Number)
  const max = Math.max(w, h)
  return (
    <div
      className={`rounded-md border-2 transition-colors ${
        selected ? 'border-[var(--glass-accent-from)]' : 'border-[var(--glass-stroke-strong)]'
      }`}
      style={{
        width: Math.min(size, size * (w / max)),
        height: Math.min(size, size * (h / max)),
      }}
    />
  )
}

export function RatioSelector({
  value,
  onChange,
  options,
  getUsage,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; recommended?: boolean }[]
  getUsage?: (ratio: string) => string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { triggerRef, panelRef, panelStyle } = useFloatingDropdown(isOpen, 300)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, panelRef, triggerRef])

  const selectedOption = options.find((o) => o.value === value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${TRIGGER_CLASSNAME} cursor-pointer`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <RatioShape ratio={value} size={18} selected />
          <span className={`${TRIGGER_TEXT_CLASSNAME} truncate`}>{selectedOption?.label || value}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="glass-surface-modal z-[9999] p-3 overflow-y-auto app-scrollbar"
          style={panelStyle}
        >
          <div className="grid grid-cols-5 gap-2">
            {options.map((option) => {
              const isSelected = value === option.value
              const usageTag = getUsage?.(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                      : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                  }`}
                  title={usageTag || undefined}
                >
                  <RatioShape ratio={option.value} size={28} selected={isSelected} />
                  <span className={`text-xs ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export function StyleSelector({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; recommended?: boolean }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { triggerRef, panelRef, panelStyle } = useFloatingDropdown(isOpen, 320)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, panelRef, triggerRef])

  const selectedOption = options.find((o) => o.value === value) || options[0]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${TRIGGER_CLASSNAME} cursor-pointer`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <AppIcon name="sparklesAlt" className="h-4 w-4 text-[var(--glass-accent-from)]" />
          <span className={`${TRIGGER_TEXT_CLASSNAME} truncate`}>{selectedOption.label}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="glass-surface-modal z-[9999] p-3"
          style={panelStyle}
        >
          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => {
              const isSelected = value === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`flex items-center p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                      : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                  }`}
                >
                  <span className={`text-sm whitespace-nowrap ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export function StylePresetSelector({
  value,
  onChange,
  options,
  labelText,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string; description: string }[]
  labelText?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { triggerRef, panelRef, panelStyle } = useFloatingDropdown(isOpen, 260)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, panelRef, triggerRef])

  const selectedOption = options.find((option) => option.value === value) ?? null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${TRIGGER_CLASSNAME} cursor-pointer`}
        title={selectedOption?.label ?? labelText ?? '无'}
      >
        <div className="flex min-w-0 items-center gap-2">
          <AppIcon name="clapperboard" className="h-4 w-4 shrink-0 text-[var(--glass-accent-from)]" />
          {labelText ? (
            <span className="truncate text-[11px] font-medium text-[var(--glass-text-tertiary)]">
              {labelText}
            </span>
          ) : null}
          <span className={`${TRIGGER_TEXT_CLASSNAME} min-w-0 flex-1 truncate`}>
            {selectedOption?.label ?? '无'}
          </span>
        </div>
        <AppIcon name="chevronDown" className={`h-4 w-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="glass-surface-modal z-[9999] p-2.5"
          style={panelStyle}
        >
          <div className="flex flex-col gap-2">
            {options.map((option) => {
              const isSelected = value === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                      : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-sm ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'font-medium text-[var(--glass-text-primary)]'}`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-[var(--glass-text-tertiary)]">
                      {option.description}
                    </div>
                  </div>
                  {isSelected && (
                    <AppIcon name="check" className="h-4 w-4 shrink-0 text-[var(--glass-accent-from)]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export function StylePresetBadge({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <div className="glass-input-base relative flex h-10 w-full items-center gap-2 overflow-hidden px-2.5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.1))',
        }}
      />
      <AppIcon name="clapperboard" className="relative h-4 w-4 shrink-0 text-[var(--glass-accent-from)]" />
      <span className="relative min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--glass-text-primary)]">
        {label}
      </span>
      <span className="relative shrink-0 rounded-full bg-[var(--glass-tone-info-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--glass-tone-info-fg)]">
        {description}
      </span>
    </div>
  )
}
