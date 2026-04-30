'use client'

import { useTranslations } from 'next-intl'
import { GlassNumberStepper, GlassSelect, type GlassSelectOption } from '@/components/ui/primitives'
import type { CapabilityValue } from '@/lib/ai-registry/types'
import type { VideoGenerationOptions, VideoModelOption } from './types'

export interface InlineVideoCapabilityField {
  field: string
  label: string
  labelKey?: string
  unitKey?: string
  options: CapabilityValue[]
  disabledOptions?: CapabilityValue[]
}

interface InlineVideoGenerationControlsProps {
  models: VideoModelOption[]
  modelValue?: string
  onModelChange: (modelKey: string) => void
  capabilityFields: InlineVideoCapabilityField[]
  capabilityOverrides: VideoGenerationOptions
  onCapabilityChange: (field: string, rawValue: string) => void
  fields?: string[]
  disabled?: boolean
  className?: string
  size?: 'sm' | 'xs'
  showLabels?: boolean
  layout?: 'inline' | 'stacked'
  wrap?: boolean
}

function isOptionDisabled(field: InlineVideoCapabilityField, value: CapabilityValue): boolean {
  return Array.isArray(field.disabledOptions) && field.disabledOptions.includes(value)
}

function formatOption(value: CapabilityValue): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  return String(value)
}

function toNumericOptions(values: CapabilityValue[]): number[] {
  return values
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value))
}

export default function InlineVideoGenerationControls({
  models,
  modelValue,
  onModelChange,
  capabilityFields,
  capabilityOverrides,
  onCapabilityChange,
  fields,
  disabled = false,
  className = '',
  size = 'sm',
  showLabels = size !== 'xs',
  layout = 'inline',
  wrap = true,
}: InlineVideoGenerationControlsProps) {
  const t = useTranslations('video')
  const visibleFields = fields
    ? fields
      .map((fieldName) => capabilityFields.find((field) => field.field === fieldName))
      .filter((field): field is InlineVideoCapabilityField => Boolean(field))
    : capabilityFields
  const selectHeight = size === 'xs' ? 'h-8 text-[11px]' : 'h-9 text-xs'
  const labelSize = size === 'xs' ? 'text-xs' : 'text-[11px]'
  const selectRadius = size === 'xs' ? 'rounded-md' : 'rounded-lg'
  const selectPadding = size === 'xs' ? 'px-2' : 'px-2'

  const resolveLabel = (field: InlineVideoCapabilityField): string => {
    if (field.labelKey) {
      try {
        return t(field.labelKey as never)
      } catch {
        // Fall through to generic capability label.
      }
    }
    try {
      return t(`capability.${field.field}` as never)
    } catch {
      return field.label
    }
  }

  const fieldWidth = (field: string): string => {
    if (field === 'duration') return size === 'xs' ? 'w-[70px]' : 'w-[92px]'
    if (field === 'resolution') return size === 'xs' ? 'w-[82px]' : 'w-[104px]'
    return size === 'xs' ? 'w-[86px]' : 'w-[104px]'
  }

  const renderModelSelect = (labelClassName: string) => (
    <label className={labelClassName}>
      {showLabels && (
        <span className={`mb-1 block font-medium text-[var(--glass-text-tertiary)] ${labelSize}`}>
          {t('panelCard.selectModel')}
        </span>
      )}
      <GlassSelect
        value={modelValue || ''}
        onValueChange={onModelChange}
        options={models.map((model): GlassSelectOption => ({
          value: model.value,
          label: model.label,
          disabled: model.disabled,
          searchText: model.providerName || model.provider,
        }))}
        disabled={disabled}
        ariaLabel={t('panelCard.selectModel')}
        placeholder={t('panelCard.selectModel')}
        size={size}
        triggerClassName={`${selectRadius} ${selectPadding} ${selectHeight}`}
        menuMinWidth={260}
      />
    </label>
  )

  const fieldSelects = visibleFields.map((field) => {
    const enabledOptions = field.options.filter((option) => !isOptionDisabled(field, option))
    const rawValue = capabilityOverrides[field.field]
    const value = rawValue !== undefined ? String(rawValue) : String(enabledOptions[0] ?? '')
    const label = resolveLabel(field)
    const numericOptions = toNumericOptions(enabledOptions)
    const isDurationField = field.field === 'duration' && numericOptions.length > 0
    return (
      <label
        key={field.field}
        className={layout === 'stacked' ? 'min-w-0' : `flex-none ${fieldWidth(field.field)}`}
      >
        {showLabels && (
          <span className={`mb-1 block font-medium text-[var(--glass-text-tertiary)] ${labelSize}`}>
            {label}
          </span>
        )}
        {isDurationField ? (
          <GlassNumberStepper
            value={value}
            onValueChange={(nextValue) => onCapabilityChange(field.field, String(nextValue))}
            allowedValues={numericOptions}
            disabled={disabled || enabledOptions.length === 0}
            ariaLabel={label}
            size={size}
          />
        ) : (
          <GlassSelect
            value={value}
            onValueChange={(nextValue) => onCapabilityChange(field.field, nextValue)}
            options={field.options.map((option): GlassSelectOption => ({
              value: String(option),
              label: formatOption(option),
              disabled: isOptionDisabled(field, option),
            }))}
            disabled={disabled || enabledOptions.length === 0}
            ariaLabel={label}
            placeholder={label}
            size={size}
            triggerClassName={`${selectRadius} ${selectPadding} ${selectHeight}`}
            menuMinWidth={120}
          />
        )}
      </label>
    )
  })

  if (layout === 'stacked') {
    return (
      <div className={`min-w-0 space-y-1.5 ${className}`}>
        {renderModelSelect('min-w-0')}
        {fieldSelects.length > 0 && (
          <div className={`grid gap-1.5 ${fieldSelects.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {fieldSelects}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${wrap ? 'flex-wrap' : 'flex-nowrap'} ${className}`}>
      {renderModelSelect(size === 'xs' ? 'min-w-[160px] flex-[1_1_180px]' : 'min-w-[150px] flex-1')}
      {fieldSelects}
    </div>
  )
}
