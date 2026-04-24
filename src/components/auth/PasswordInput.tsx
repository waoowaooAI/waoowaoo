'use client'

import React, { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'

type PasswordInputProps = {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder: string
  showLabel: string
  hideLabel: string
  required?: boolean
}

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  showLabel,
  hideLabel,
  required = false,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const buttonLabel = visible ? hideLabel : showLabel
  const iconName = visible ? 'eyeOff' : 'eye'

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="glass-input-base w-full px-4 py-3 pr-12"
        placeholder={placeholder}
      />
      <button
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--glass-text-tertiary)] transition hover:text-[var(--glass-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glass-tone-info-fg)]"
      >
        <AppIcon name={iconName} aria-hidden="true" size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
